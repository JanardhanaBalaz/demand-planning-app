import { Router, Request, Response } from 'express';

const router = Router();

const WMS_API_BASE = 'https://uh-wms-api.onrender.com/api/v1';
const WMS_TOKEN = (process.env.WMS_API_TOKEN || '').trim();

interface WmsWarehouse {
  id: number;
  code: string;
  name: string;
  city: string;
  country: string;
  is_active: boolean;
}

interface WmsOrder {
  id: number;
  order_number: string;
  source: string;
  status: string;
  priority: number;
  ship_to_name: string;
  ship_to_city: string;
  ship_to_country: string;
  created_at: string;
  allocated_at: string | null;
}

async function wmsGet<T>(path: string): Promise<T> {
  const url = `${WMS_API_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${WMS_TOKEN}` },
    redirect: 'follow',
  });
  if (!resp.ok) throw new Error(`WMS API ${path} failed: ${resp.status}`);
  return resp.json() as Promise<T>;
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    if (!WMS_TOKEN) {
      res.status(500).json({ message: 'WMS_API_TOKEN not configured' });
      return;
    }

    // Fetch warehouses
    const whResp = await wmsGet<{ items: WmsWarehouse[] }>('/warehouses/');
    const activeWarehouses = whResp.items.filter(w => w.is_active);

    // Fetch open orders from all active warehouses in parallel
    const NON_SHIPPED_STATUSES = ['PENDING', 'ALLOCATED', 'PICKING', 'READY_TO_SHIP'];

    const orderPromises = activeWarehouses.map(async (wh) => {
      try {
        const data = await wmsGet<{ items: WmsOrder[]; total: number }>(
          `/orders/?warehouse_id=${wh.id}&page=1&page_size=500`
        );
        // Filter to non-shipped orders and attach warehouse info
        return data.items
          .filter(o => NON_SHIPPED_STATUSES.includes(o.status))
          .map(o => ({
            ...o,
            warehouse_code: wh.code,
            warehouse_name: wh.name,
          }));
      } catch (err) {
        console.warn(`Failed to fetch orders for ${wh.code}:`, err);
        return [];
      }
    });

    const orderArrays = await Promise.all(orderPromises);
    const orders = orderArrays.flat();

    res.json({
      warehouses: activeWarehouses.map(w => ({ id: w.id, code: w.code, name: w.name, country: w.country })),
      orders,
    });
  } catch (error) {
    console.error('Open orders fetch failed:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Failed to fetch open orders', detail: msg });
  }
});

export default router;
