import { Router, Request, Response } from 'express';

const router = Router();

const WMS_API_BASE = 'https://uh-wms-api.onrender.com/api/v1';
const WMS_TOKEN = process.env.WMS_API_TOKEN || '';
const METABASE_URL = process.env.METABASE_URL || 'https://metabase.ultrahuman.com';
const METABASE_API_KEY = process.env.METABASE_API_KEY || '';

async function wmsGet<T>(path: string): Promise<T> {
  const url = `${WMS_API_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${WMS_TOKEN}` },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`WMS API ${path} failed: ${resp.status}`);
  return resp.json() as Promise<T>;
}

// B2C Daily Shipping Batch (via WMS Metabase proxy)
router.get('/daily-shipping', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!WMS_TOKEN) {
      res.status(500).json({ message: 'WMS_API_TOKEN not configured' });
      return;
    }
    const data = await wmsGet<{ success: boolean; columns: unknown[]; data: unknown[]; row_count: number }>(
      '/metabase/daily-shipping-batch/'
    );
    res.json(data);
  } catch (error) {
    console.error('Daily shipping fetch failed:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Failed to fetch daily shipping data', detail: msg });
  }
});

// B2B Bulk Orders (via WMS Metabase proxy)
router.get('/b2b-bulk-orders', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!WMS_TOKEN) {
      res.status(500).json({ message: 'WMS_API_TOKEN not configured' });
      return;
    }
    const data = await wmsGet<{ success: boolean; columns: unknown[]; data: unknown[]; row_count: number }>(
      '/metabase/b2b-bulk-orders/'
    );
    res.json(data);
  } catch (error) {
    console.error('B2B bulk orders fetch failed:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Failed to fetch B2B bulk orders', detail: msg });
  }
});

// Unicommerce Inventory (via Metabase Q19168)
router.get('/inventory', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!METABASE_API_KEY) {
      res.status(500).json({ message: 'METABASE_API_KEY not configured' });
      return;
    }
    const url = `${METABASE_URL}/api/card/19168/query/json`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': METABASE_API_KEY },
      body: JSON.stringify({}),
    });
    if (!resp.ok) throw new Error(`Metabase Q19168 failed: ${resp.status}`);
    const rows = await resp.json() as Record<string, unknown>[];
    res.json({ success: true, data: rows, row_count: rows.length });
  } catch (error) {
    console.error('Inventory fetch failed:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Failed to fetch inventory data', detail: msg });
  }
});

export default router;
