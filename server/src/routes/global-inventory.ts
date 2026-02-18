import { Router, Request, Response } from 'express';

const router = Router();

const SHEET_ID = '1T6nsGVDjqxRkkrGUJw3WSxc18q1zkvt97UJ0m5xG5Oo';
const GID = '0'; // Tab: Single View - Ring AIR

interface InventoryRow {
  sku: string;
  ringType: string;
  warehouses: Record<string, number>;
  whTotal: number;
  fbaChannels: Record<string, number>;
  fbaTotal: number;
  grandTotal: number;
}

interface InventoryData {
  lastUpdated: string;
  whColumns: string[];
  fbaColumns: string[];
  rows: InventoryRow[];
  whTotals: Record<string, number>;
  fbaTotals: Record<string, number>;
  whGrandTotal: number;
  fbaGrandTotal: number;
  grandTotal: number;
}

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

function parseNumber(val: string): number {
  if (!val || val.trim() === '') return 0;
  return parseInt(val.replace(/,/g, ''), 10) || 0;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

// Cache to avoid hitting Google Sheets too frequently
let cachedData: InventoryData | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchSheetData(): Promise<InventoryData> {
  const now = Date.now();
  if (cachedData && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedData;
  }

  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch Google Sheet: ${resp.status}`);
  }

  const text = await resp.text();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (lines.length < 4) {
    throw new Error('Sheet has insufficient data');
  }

  // Row 0: totals row (has column totals)
  // Row 1: date row
  // Row 2: header row (SKU, warehouse names, FBA names)
  // Row 3+: data rows

  const totalsRow = parseCSVLine(lines[0]);
  const headerRow = parseCSVLine(lines[2]);

  // Parse warehouse columns (columns 1-6, before "WH Total")
  const whTotalIdx = headerRow.findIndex(h => h.trim().toLowerCase().includes('wh total'));
  const whColumns = headerRow.slice(1, whTotalIdx).map(h => h.trim());

  // Parse FBA columns (after the empty column separator after WH Total)
  const fbaStartIdx = whTotalIdx + 2; // skip WH Total and empty separator
  const fbaTotalIdx = headerRow.findIndex((h, i) => i > fbaStartIdx && h.trim().toLowerCase().includes('fba - total'));
  // Also check for "FBA - Total" or "FBA Total"
  const fbaEndIdx = fbaTotalIdx > 0 ? fbaTotalIdx : headerRow.length - 2;
  const fbaColumns = headerRow.slice(fbaStartIdx, fbaEndIdx).map(h => h.trim()).filter(h => h.length > 0);

  const rows: InventoryRow[] = [];
  const whTotals: Record<string, number> = {};
  const fbaTotals: Record<string, number> = {};
  let whGrandTotal = 0;
  let fbaGrandTotal = 0;
  let grandTotal = 0;

  for (const col of whColumns) whTotals[col] = 0;
  for (const col of fbaColumns) fbaTotals[col] = 0;

  for (let i = 3; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const sku = (cells[0] || '').trim();
    if (!sku || sku.length < 2) continue;

    const warehouses: Record<string, number> = {};
    let whTotal = 0;
    for (let j = 0; j < whColumns.length; j++) {
      const val = parseNumber(cells[1 + j] || '0');
      warehouses[whColumns[j]] = val;
      whTotals[whColumns[j]] += val;
      whTotal += val;
    }

    const fbaChannels: Record<string, number> = {};
    let fbaTotal = 0;
    for (let j = 0; j < fbaColumns.length; j++) {
      const val = parseNumber(cells[fbaStartIdx + j] || '0');
      fbaChannels[fbaColumns[j]] = val;
      fbaTotals[fbaColumns[j]] += val;
      fbaTotal += val;
    }

    const rowGrandTotal = whTotal + fbaTotal;
    whGrandTotal += whTotal;
    fbaGrandTotal += fbaTotal;
    grandTotal += rowGrandTotal;

    rows.push({
      sku,
      ringType: getRingType(sku),
      warehouses,
      whTotal,
      fbaChannels,
      fbaTotal,
      grandTotal: rowGrandTotal,
    });
  }

  cachedData = {
    lastUpdated: new Date().toISOString(),
    whColumns,
    fbaColumns,
    rows,
    whTotals,
    fbaTotals,
    whGrandTotal,
    fbaGrandTotal,
    grandTotal,
  };
  cacheTimestamp = now;

  return cachedData;
}

// GET / - Return full inventory data
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await fetchSheetData();
    res.json(data);
  } catch (error) {
    console.error('Failed to fetch inventory:', error);
    res.status(500).json({ message: 'Failed to fetch inventory data from Google Sheets' });
  }
});

// POST /refresh - Force cache refresh
router.post('/refresh', async (_req: Request, res: Response): Promise<void> => {
  try {
    cachedData = null;
    cacheTimestamp = 0;
    const data = await fetchSheetData();
    res.json(data);
  } catch (error) {
    console.error('Failed to refresh inventory:', error);
    res.status(500).json({ message: 'Failed to refresh inventory data' });
  }
});

export default router;
