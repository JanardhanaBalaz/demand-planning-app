import { Router, Response } from 'express';
import { query } from '../models/db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/:productId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;

    const result = await query(
      `SELECT id, product_id as "productId", predicted_quantity as "predictedQuantity",
       forecast_date as "forecastDate", method, created_at as "createdAt"
       FROM forecasts
       WHERE product_id = $1
       ORDER BY forecast_date DESC`,
      [productId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Failed to fetch forecasts:', error);
    res.status(500).json({ message: 'Failed to fetch forecasts' });
  }
});

router.post('/:productId', requireRole('admin', 'analyst'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { productId } = req.params;
    const { method = 'moving_average' } = req.body;

    // Fetch historical demand data
    const demandResult = await query(
      `SELECT quantity, date FROM demand_records
       WHERE product_id = $1
       ORDER BY date DESC
       LIMIT 90`,
      [productId]
    );

    if (demandResult.rows.length < 7) {
      res.status(400).json({
        message: 'Insufficient data for forecasting. Need at least 7 demand records.'
      });
      return;
    }

    const demands = demandResult.rows.map(r => r.quantity);
    let forecasts: { date: Date; quantity: number }[] = [];

    switch (method) {
      case 'moving_average':
        forecasts = generateMovingAverageForecast(demands);
        break;
      case 'exponential_smoothing':
        forecasts = generateExponentialSmoothingForecast(demands);
        break;
      case 'linear_trend':
        forecasts = generateLinearTrendForecast(demands);
        break;
      default:
        res.status(400).json({ message: 'Invalid forecast method' });
        return;
    }

    // Delete old forecasts for this product
    await query('DELETE FROM forecasts WHERE product_id = $1', [productId]);

    // Insert new forecasts
    for (const forecast of forecasts) {
      await query(
        `INSERT INTO forecasts (product_id, predicted_quantity, forecast_date, method)
         VALUES ($1, $2, $3, $4)`,
        [productId, Math.round(forecast.quantity), forecast.date, method]
      );
    }

    const result = await query(
      `SELECT id, product_id as "productId", predicted_quantity as "predictedQuantity",
       forecast_date as "forecastDate", method, created_at as "createdAt"
       FROM forecasts WHERE product_id = $1 ORDER BY forecast_date`,
      [productId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Failed to generate forecast:', error);
    res.status(500).json({ message: 'Failed to generate forecast' });
  }
});

function generateMovingAverageForecast(demands: number[]): { date: Date; quantity: number }[] {
  const windowSize = Math.min(7, demands.length);
  const recentDemands = demands.slice(0, windowSize);
  const average = recentDemands.reduce((a, b) => a + b, 0) / windowSize;

  const forecasts: { date: Date; quantity: number }[] = [];
  for (let i = 1; i <= 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    forecasts.push({ date, quantity: average });
  }
  return forecasts;
}

function generateExponentialSmoothingForecast(demands: number[]): { date: Date; quantity: number }[] {
  const alpha = 0.3; // Smoothing factor
  let smoothed = demands[demands.length - 1];

  for (let i = demands.length - 2; i >= 0; i--) {
    smoothed = alpha * demands[i] + (1 - alpha) * smoothed;
  }

  const forecasts: { date: Date; quantity: number }[] = [];
  for (let i = 1; i <= 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    forecasts.push({ date, quantity: smoothed });
  }
  return forecasts;
}

function generateLinearTrendForecast(demands: number[]): { date: Date; quantity: number }[] {
  // Simple linear regression
  const n = demands.length;
  const x = [...Array(n)].map((_, i) => i);
  const y = [...demands].reverse();

  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
  const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  const forecasts: { date: Date; quantity: number }[] = [];
  for (let i = 1; i <= 14; i++) {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const predicted = intercept + slope * (n + i - 1);
    forecasts.push({ date, quantity: Math.max(0, predicted) });
  }
  return forecasts;
}

export default router;
