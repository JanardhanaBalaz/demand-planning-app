import { Router, Request, Response } from 'express';

const router = Router();

const SHEET_ID = '1T6nsGVDjqxRkkrGUJw3WSxc18q1zkvt97UJ0m5xG5Oo';
const GID = '0';
const METABASE_URL = process.env.METABASE_URL || 'https://metabase.ultrahuman.com';
const METABASE_API_KEY = process.env.METABASE_API_KEY || '';

const WABI_SABI_PREFIXES = ['WA', 'WG', 'WM', 'WR', 'WS', 'WT'];

// Per-location demand mapping: which (channel, country) pairs flow through each location
// Based on warehouse-to-service-location mapping sheet
// '*' as country means all countries for that channel
interface DemandRoute { channel: string; country: string; }

const LOCATION_DEMAND: Record<string, DemandRoute[] | '*'> = {
  // Warehouses
  'IQF+ AD': [
    { channel: 'B2C', country: 'UNITED ARAB EMIRATES' },
    { channel: 'Marketplace', country: 'UNITED ARAB EMIRATES' },
    { channel: 'Replacement', country: 'UNITED ARAB EMIRATES' },
  ],
  'BBMS': [
    { channel: 'Replacement', country: 'UNITED STATES' },
    { channel: 'Marketplace', country: 'CANADA' },
    { channel: 'Retail', country: 'CANADA' },
    { channel: 'Marketplace', country: 'EUROPE UNION' },
    { channel: 'Marketplace', country: 'UNITED KINGDOM' },
    { channel: 'Marketplace', country: 'AUSTRALIA' },
  ],
  'Blr': '*', // Bangalore factory serves everything
  'NL- WH': [
    { channel: 'Marketplace', country: 'EUROPE UNION' },
  ],
  'SVT': [
    // SVT factory feeds BBMS — same demand profile
    { channel: 'Replacement', country: 'UNITED STATES' },
    { channel: 'Marketplace', country: 'CANADA' },
    { channel: 'Retail', country: 'CANADA' },
    { channel: 'Marketplace', country: 'EUROPE UNION' },
    { channel: 'Marketplace', country: 'UNITED KINGDOM' },
    { channel: 'Marketplace', country: 'AUSTRALIA' },
  ],
  'UK -WH': [
    { channel: 'Marketplace', country: 'UNITED KINGDOM' },
  ],
  // FBAs
  'AUS-FBA': [
    { channel: 'B2C', country: 'AUSTRALIA' },
    { channel: 'Replacement', country: 'AUSTRALIA' },
    { channel: 'Marketplace', country: 'AUSTRALIA' },
  ],
  'AUS- FBA': [
    { channel: 'B2C', country: 'AUSTRALIA' },
    { channel: 'Replacement', country: 'AUSTRALIA' },
    { channel: 'Marketplace', country: 'AUSTRALIA' },
  ],
  'CA-FBA': [
    { channel: 'B2C', country: 'CANADA' },
    { channel: 'Replacement', country: 'CANADA' },
    { channel: 'Marketplace', country: 'CANADA' },
  ],
  'EU-FBA': [
    { channel: 'B2C', country: 'EUROPE UNION' },
    { channel: 'Replacement', country: 'EUROPE UNION' },
    { channel: 'Marketplace', country: 'EUROPE UNION' },
  ],
  'UK-FBA': [
    { channel: 'B2C', country: 'UNITED KINGDOM' },
    { channel: 'Marketplace', country: 'UNITED KINGDOM' },
  ],
  'SG-FBA': [
    { channel: 'Marketplace', country: 'SINGAPORE' },
  ],
  'UAE-FBA': [
    { channel: 'Marketplace', country: 'UNITED ARAB EMIRATES' },
  ],
  'FBA - INDIA': [
    { channel: 'Marketplace', country: 'INDIA' },
  ],
  'Shoppee': [
    { channel: 'Marketplace', country: 'THAILAND' },
  ],
  'Lazada': [
    { channel: 'Marketplace', country: 'THAILAND' },
  ],
};

const RING_TYPES: Record<string, string[]> = {
  'Ring Air': ['AA', 'AG', 'AS', 'BR', 'MG', 'RT'],
  'Diesel Collaborated': ['DB', 'DS'],
  'Wabi Sabi': ['WA', 'WG', 'WM', 'WR', 'WS', 'WT'],
};

function getRingType(sku: string): string {
  const prefix = sku.slice(0, 2).toUpperCase();
  for (const [type, prefixes] of Object.entries(RING_TYPES)) {
    if (prefixes.includes(prefix)) return type;
  }
  return 'Other';
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { inQuotes = !inQuotes; }
    else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
    else { current += char; }
  }
  result.push(current.trim());
  return result;
}

function parseNumber(val: string): number {
  if (!val || val.trim() === '') return 0;
  return parseInt(val.replace(/,/g, ''), 10) || 0;
}

// Fetch inventory from Google Sheet — returns per-SKU per-location stock
async function fetchInventory(): Promise<{
  locations: string[];
  skuStock: Record<string, Record<string, number>>;
}> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch inventory sheet: ${resp.status}`);

  const text = await resp.text();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const headerRow = parseCSVLine(lines[2]);

  const whTotalIdx = headerRow.findIndex(h => h.toLowerCase().includes('wh total'));
  const whColumns = headerRow.slice(1, whTotalIdx).map(h => h.trim());

  const fbaStartIdx = whTotalIdx + 2;
  const fbaTotalIdx = headerRow.findIndex((h, i) => i > fbaStartIdx && h.toLowerCase().includes('fba - total'));
  const fbaColumns = headerRow.slice(fbaStartIdx, fbaTotalIdx).map(h => h.trim()).filter(h => h.length > 0);

  const locations = [...whColumns, ...fbaColumns];
  const skuStock: Record<string, Record<string, number>> = {};

  for (let i = 3; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const sku = (cells[0] || '').trim();
    if (!sku || sku.length < 2) continue;

    skuStock[sku] = {};
    for (let j = 0; j < whColumns.length; j++) {
      const val = parseNumber(cells[1 + j] || '0');
      if (val > 0) skuStock[sku][whColumns[j]] = val;
    }
    for (let j = 0; j < fbaColumns.length; j++) {
      const val = parseNumber(cells[fbaStartIdx + j] || '0');
      if (val > 0) skuStock[sku][fbaColumns[j]] = val;
    }
  }

  return { locations, skuStock };
}

// Fetch per-SKU demand from Metabase (last 30 days), with channel×country breakdown
async function fetchDemandData(): Promise<{
  perSku: Record<string, { drr: number; totalRings: number; channels: Record<string, number> }>;
  // sku -> "channel::country" -> rings (e.g. "B2C::UNITED STATES" -> 150)
  perSkuChannelCountry: Record<string, Record<string, number>>;
}> {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const startStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  const endStr = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;

  const url = `${METABASE_URL}/api/card/19170/query/json`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': METABASE_API_KEY },
    body: JSON.stringify({
      parameters: [
        { type: 'date/single', target: ['variable', ['template-tag', 'start_date']], value: startStr },
        { type: 'date/single', target: ['variable', ['template-tag', 'end_date']], value: endStr },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`Metabase Q19170 failed: ${resp.status}`);
  const rows = await resp.json() as Record<string, unknown>[];
  const days = 30;

  const skuRings: Record<string, { total: number; channels: Record<string, number> }> = {};
  const skuChannelCountry: Record<string, Record<string, number>> = {};

  for (const row of rows) {
    const sku = String(row['SKU'] || '').trim();
    const channel = String(row['CHANNEL'] || '').trim();
    const country = String(row['NEW_COUNTRY_BUCKET'] || '').trim().toUpperCase();
    const rings = Number(row['RING_COUNT'] || 0);

    if (!sku || !channel) continue;

    // Global per-SKU aggregation
    if (!skuRings[sku]) skuRings[sku] = { total: 0, channels: {} };
    skuRings[sku].total += rings;
    skuRings[sku].channels[channel] = (skuRings[sku].channels[channel] || 0) + rings;

    // Per-SKU per-channel×country aggregation
    if (country) {
      const key = `${channel}::${country}`;
      if (!skuChannelCountry[sku]) skuChannelCountry[sku] = {};
      skuChannelCountry[sku][key] = (skuChannelCountry[sku][key] || 0) + rings;
    }
  }

  // Convert to DRR
  const perSku: Record<string, { drr: number; totalRings: number; channels: Record<string, number> }> = {};
  for (const [sku, data] of Object.entries(skuRings)) {
    const channelDRR: Record<string, number> = {};
    for (const [ch, rings] of Object.entries(data.channels)) {
      channelDRR[ch] = rings / days;
    }
    perSku[sku] = { drr: data.total / days, totalRings: data.total, channels: channelDRR };
  }

  return { perSku, perSkuChannelCountry: skuChannelCountry };
}

interface SkuAnalysis {
  sku: string;
  ringType: string;
  totalStock: number;
  dailyDemand: number;
  daysOfCover: number;
  status: 'critical' | 'understock' | 'balanced' | 'overstock';
  warehouseStock: Record<string, number>;
  warehouseDRR: Record<string, number>;
  warehouseDOC: Record<string, number>;
  channelDemand: Record<string, number>;
}

function getStatus(days: number): 'critical' | 'understock' | 'balanced' | 'overstock' {
  if (days < 15) return 'critical';
  if (days < 30) return 'understock';
  if (days <= 60) return 'balanced';
  return 'overstock';
}

// GET / - SKU-level stock analysis
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    console.log('Starting SKU-level stock analysis...');

    const [inventory, demandData] = await Promise.all([
      fetchInventory(),
      fetchDemandData(),
    ]);

    const days = 30;

    // Pre-compute Thailand stock split ratio for Shoppee/Lazada
    let shoppeeTotal = 0, lazadaTotal = 0;
    for (const stockMap of Object.values(inventory.skuStock)) {
      shoppeeTotal += stockMap['Shoppee'] || 0;
      lazadaTotal += stockMap['Lazada'] || 0;
    }
    const thaiTotal = shoppeeTotal + lazadaTotal;

    // Get all unique SKUs from both inventory and demand
    const allSkus = new Set<string>();
    for (const sku of Object.keys(inventory.skuStock)) allSkus.add(sku);
    for (const sku of Object.keys(demandData.perSku)) allSkus.add(sku);

    const skuAnalysis: SkuAnalysis[] = [];

    for (const sku of allSkus) {
      const stockMap = inventory.skuStock[sku] || {};
      const totalStock = Object.values(stockMap).reduce((s, v) => s + v, 0);
      const skuDemand = demandData.perSku[sku] || { drr: 0, totalRings: 0, channels: {} };
      const dailyDemand = skuDemand.drr;
      const ccRings = demandData.perSkuChannelCountry[sku] || {};

      // Only include SKUs that have stock OR demand
      if (totalStock === 0 && dailyDemand === 0) continue;

      const daysOfCover = dailyDemand > 0
        ? totalStock / dailyDemand
        : (totalStock > 0 ? 9999 : 0);

      // Compute per-location DRR and DOC using channel×country demand routes
      const warehouseDRR: Record<string, number> = {};
      const warehouseDOC: Record<string, number> = {};

      for (const location of inventory.locations) {
        const demandRoutes = LOCATION_DEMAND[location];
        if (!demandRoutes) continue; // No mapping for this location

        let locationRings = 0;

        if (demandRoutes === '*') {
          // Global — serves everything (Bangalore factory)
          locationRings = skuDemand.totalRings;
        } else {
          for (const route of demandRoutes) {
            // Thailand Shoppee/Lazada: split Marketplace::THAILAND proportionally
            if (route.country === 'THAILAND' && route.channel === 'Marketplace'
                && (location === 'Shoppee' || location === 'Lazada')) {
              const thaiMarketplace = ccRings['Marketplace::THAILAND'] || 0;
              const ratio = thaiTotal > 0
                ? (location === 'Shoppee' ? shoppeeTotal : lazadaTotal) / thaiTotal
                : 0.5;
              locationRings += thaiMarketplace * ratio;
            } else {
              const key = `${route.channel}::${route.country}`;
              locationRings += ccRings[key] || 0;
            }
          }
        }

        const locationDRR = locationRings / days;
        warehouseDRR[location] = Math.round(locationDRR * 100) / 100;

        const locStock = stockMap[location] || 0;
        const locDOC = locationDRR > 0
          ? locStock / locationDRR
          : (locStock > 0 ? 9999 : 0);
        warehouseDOC[location] = locDOC >= 9999 ? 9999 : Math.round(locDOC);
      }

      skuAnalysis.push({
        sku,
        ringType: getRingType(sku),
        totalStock,
        dailyDemand: Math.round(dailyDemand * 100) / 100,
        daysOfCover: daysOfCover >= 9999 ? 9999 : Math.round(daysOfCover),
        status: getStatus(daysOfCover >= 9999 ? 9999 : daysOfCover),
        warehouseStock: stockMap,
        warehouseDRR,
        warehouseDOC,
        channelDemand: Object.fromEntries(
          Object.entries(skuDemand.channels).map(([ch, drr]) => [ch, Math.round(drr * 100) / 100])
        ),
      });
    }

    // Sort by days of cover ascending (most critical first)
    skuAnalysis.sort((a, b) => a.daysOfCover - b.daysOfCover);

    const summary = {
      critical: skuAnalysis.filter(s => s.status === 'critical').length,
      understock: skuAnalysis.filter(s => s.status === 'understock').length,
      balanced: skuAnalysis.filter(s => s.status === 'balanced').length,
      overstock: skuAnalysis.filter(s => s.status === 'overstock').length,
      totalSKUs: skuAnalysis.length,
    };

    res.json({
      summary,
      skus: skuAnalysis,
      locations: inventory.locations,
    });
  } catch (error) {
    console.error('Stock analysis failed:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Failed to run stock analysis', detail: msg });
  }
});

export default router;
