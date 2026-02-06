import { Router, Response } from 'express';
import multer from 'multer';
import { query } from '../models/db.js';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth.js';
import { parseCSV, generateCSV } from '../utils/csv.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.use(authenticate);

router.post('/import/products', requireRole('admin', 'analyst'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const content = req.file.buffer.toString('utf-8');
    const records = parseCSV(content);

    if (records.length === 0) {
      res.status(400).json({ message: 'No valid records found in file' });
      return;
    }

    let importedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        const { sku, name, description, category, unitPrice } = row;

        if (!sku || !name) {
          errors.push(`Row ${i + 2}: Missing required fields (sku, name)`);
          continue;
        }

        // Check if product exists
        const existing = await query('SELECT id FROM products WHERE sku = $1', [sku]);

        if (existing.rows.length > 0) {
          // Update existing product
          await query(
            `UPDATE products SET name = $1, description = $2, category = $3, unit_price = $4 WHERE sku = $5`,
            [name, description || null, category || null, parseFloat(unitPrice) || 0, sku]
          );
        } else {
          // Insert new product
          const result = await query(
            `INSERT INTO products (sku, name, description, category, unit_price, created_by)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
            [sku, name, description || null, category || null, parseFloat(unitPrice) || 0, req.user!.id]
          );

          // Create inventory record
          await query(
            'INSERT INTO inventory (product_id, quantity, location) VALUES ($1, 0, NULL)',
            [result.rows[0].id]
          );
        }

        importedCount++;
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    res.json({
      message: `Imported ${importedCount} products`,
      count: importedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Failed to import products:', error);
    res.status(500).json({ message: 'Failed to import products' });
  }
});

router.post('/import/demand', requireRole('admin', 'analyst'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    const content = req.file.buffer.toString('utf-8');
    const records = parseCSV(content);

    if (records.length === 0) {
      res.status(400).json({ message: 'No valid records found in file' });
      return;
    }

    let importedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      try {
        const { productId, quantity, date, source } = row;

        if (!productId || !quantity || !date) {
          errors.push(`Row ${i + 2}: Missing required fields (productId, quantity, date)`);
          continue;
        }

        // Verify product exists
        const productCheck = await query('SELECT id FROM products WHERE id = $1', [productId]);
        if (productCheck.rows.length === 0) {
          errors.push(`Row ${i + 2}: Product with ID ${productId} not found`);
          continue;
        }

        await query(
          'INSERT INTO demand_records (product_id, quantity, date, source) VALUES ($1, $2, $3, $4)',
          [parseInt(productId), parseInt(quantity), date, source || null]
        );

        importedCount++;
      } catch (err) {
        errors.push(`Row ${i + 2}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    res.json({
      message: `Imported ${importedCount} demand records`,
      count: importedCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('Failed to import demand records:', error);
    res.status(500).json({ message: 'Failed to import demand records' });
  }
});

router.get('/export/report', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type } = req.query;

    let data: Record<string, unknown>[] = [];
    let filename = 'report.csv';

    switch (type) {
      case 'products': {
        const result = await query(
          `SELECT p.sku, p.name, p.description, p.category, p.unit_price as "unitPrice",
           i.quantity as "inventoryQuantity", i.location
           FROM products p
           LEFT JOIN inventory i ON p.id = i.product_id
           ORDER BY p.name`
        );
        data = result.rows;
        filename = 'products-report.csv';
        break;
      }
      case 'demand': {
        const result = await query(
          `SELECT p.sku, p.name as "productName", d.quantity, d.date, d.source
           FROM demand_records d
           JOIN products p ON d.product_id = p.id
           ORDER BY d.date DESC`
        );
        data = result.rows;
        filename = 'demand-report.csv';
        break;
      }
      case 'inventory': {
        const result = await query(
          `SELECT p.sku, p.name as "productName", i.quantity, i.location, i.last_updated as "lastUpdated"
           FROM inventory i
           JOIN products p ON i.product_id = p.id
           ORDER BY p.name`
        );
        data = result.rows;
        filename = 'inventory-report.csv';
        break;
      }
      case 'forecasts': {
        const result = await query(
          `SELECT p.sku, p.name as "productName", f.predicted_quantity as "predictedQuantity",
           f.forecast_date as "forecastDate", f.method, f.created_at as "createdAt"
           FROM forecasts f
           JOIN products p ON f.product_id = p.id
           ORDER BY f.forecast_date`
        );
        data = result.rows;
        filename = 'forecasts-report.csv';
        break;
      }
      default:
        res.status(400).json({ message: 'Invalid report type' });
        return;
    }

    const csv = generateCSV(data);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Failed to export report:', error);
    res.status(500).json({ message: 'Failed to export report' });
  }
});

export default router;
