import { Router, Request, Response } from 'express';
import { query as dbQuery } from '../models/db.js';

const router = Router();

const SHEET_ID = '1T6nsGVDjqxRkkrGUJw3WSxc18q1zkvt97UJ0m5xG5Oo';
const GID = '0';
const METABASE_URL = process.env.METABASE_URL || 'https://metabase.ultrahuman.com';
const METABASE_API_KEY = process.env.METABASE_API_KEY || '';

// FBA configuration: which geographies each FBA serves
interface FBAConfig {
  name: string;
  geoLabel: string;
  marketplaceCountries: string[];
  b2cReplacementCountries: string[];
  inventoryColumnName: string;
}

const FBA_CONFIG: Record<string, FBAConfig> = {
  'AUS-FBA': {
    name: 'AUS-FBA', geoLabel: 'Australia',
    marketplaceCountries: ['AUSTRALIA'],
    b2cReplacementCountries: ['AUSTRALIA'],
    inventoryColumnName: 'AUS-FBA',
  },
  'CA-FBA': {
    name: 'CA-FBA', geoLabel: 'Canada',
    marketplaceCountries: ['CANADA'],
    b2cReplacementCountries: ['CANADA'],
    inventoryColumnName: 'CA-FBA',
  },
  'EU-FBA': {
    name: 'EU-FBA', geoLabel: 'Europe Union',
    marketplaceCountries: ['EUROPE UNION'],
    b2cReplacementCountries: ['EUROPE UNION'],
    inventoryColumnName: 'EU-FBA',
  },
  'UK-FBA': {
    name: 'UK-FBA', geoLabel: 'United Kingdom',
    marketplaceCountries: ['UNITED KINGDOM'],
    b2cReplacementCountries: ['UNITED KINGDOM'],
    inventoryColumnName: 'UK-FBA',
  },
  'SG-FBA': {
    name: 'SG-FBA', geoLabel: 'Singapore',
    marketplaceCountries: ['SINGAPORE'],
    b2cReplacementCountries: ['SINGAPORE'],
    inventoryColumnName: 'SG-FBA',
  },
  'UAE-FBA': {
    name: 'UAE-FBA', geoLabel: 'UAE',
    marketplaceCountries: ['UNITED ARAB EMIRATES'],
    b2cReplacementCountries: ['UNITED ARAB EMIRATES'],
    inventoryColumnName: 'UAE-FBA',
  },
  'FBA-INDIA': {
    name: 'FBA-INDIA', geoLabel: 'India',
    marketplaceCountries: ['INDIA'],
    b2cReplacementCountries: ['INDIA'],
    inventoryColumnName: 'FBA - INDIA',
  },
  'Shoppee': {
    name: 'Shoppee', geoLabel: 'Thailand',
    marketplaceCountries: ['THAILAND'],
    b2cReplacementCountries: [],
    inventoryColumnName: 'Shoppee',
  },
  'Lazada': {
    name: 'Lazada', geoLabel: 'Thailand',
    marketplaceCountries: ['THAILAND'],
    b2cReplacementCountries: [],
    inventoryColumnName: 'Lazada',
  },
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

// Cache
let cache: { data: unknown; timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Fetch FBA inventory from Google Sheet
async function fetchFBAInventory(): Promise<{
  fbaColumns: string[];
  skuStock: Record<string, Record<string, number>>;
}> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch inventory sheet: ${resp.status}`);

  const text = await resp.text();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const headerRow = parseCSVLine(lines[2]);

  // Find FBA columns (after WH Total + 1 gap column)
  const whTotalIdx = headerRow.findIndex(h => h.toLowerCase().includes('wh total'));
  const fbaStartIdx = whTotalIdx + 2;
  const fbaTotalIdx = headerRow.findIndex((h, i) => i > fbaStartIdx && h.toLowerCase().includes('fba - total'));
  const fbaColumns = headerRow.slice(fbaStartIdx, fbaTotalIdx).map(h => h.trim()).filter(h => h.length > 0);

  const skuStock: Record<string, Record<string, number>> = {};

  for (let i = 3; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const sku = (cells[0] || '').trim();
    if (!sku || sku.length < 2) continue;

    skuStock[sku] = {};
    for (let j = 0; j < fbaColumns.length; j++) {
      const val = parseNumber(cells[fbaStartIdx + j] || '0');
      if (val > 0) skuStock[sku][fbaColumns[j]] = val;
    }
  }

  return { fbaColumns, skuStock };
}

// Fetch per-SKU per-channel per-country demand from Metabase (last 30 days)
async function fetchDemandByCountry(): Promise<{
  sku: string;
  channel: string;
  country: string;
  rings: number;
}[]> {
  const end = new Date();
  const start = new Date(end.getTime() - 29 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const url = `${METABASE_URL}/api/card/19170/query/json`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': METABASE_API_KEY },
    body: JSON.stringify({
      parameters: [
        { type: 'date/single', target: ['variable', ['template-tag', 'start_date']], value: fmt(start) },
        { type: 'date/single', target: ['variable', ['template-tag', 'end_date']], value: fmt(end) },
      ],
    }),
  });

  if (!resp.ok) throw new Error(`Metabase Q19170 failed: ${resp.status}`);
  const rows = await resp.json() as Record<string, unknown>[];

  return rows.map(row => ({
    sku: String(row['SKU'] || '').trim(),
    channel: String(row['CHANNEL'] || '').trim(),
    country: String(row['NEW_COUNTRY_BUCKET'] || '').trim().toUpperCase(),
    rings: Number(row['RING_COUNT'] || 0),
  })).filter(r => r.sku && r.channel && r.rings > 0);
}

// Fetch monthly forecasts from DB and compute country split ratios
async function fetchMonthlyForecasts(
  countryRatios: Record<string, Record<string, number>> // channel -> country -> ratio
): Promise<Record<string, Record<string, Record<string, number>>>> {
  // Returns: fbaKey -> month -> { total, perChannel }
  const result: Record<string, Record<string, Record<string, number>>> = {};

  try {
    const res = await dbQuery(
      `SELECT channel, sku, forecast_month, forecast_units
       FROM demand_forecasts
       WHERE channel IN ('B2C', 'Replacement', 'Marketplace')
       ORDER BY forecast_month`
    );

    // Group by channel -> month -> total units
    const channelMonthTotals: Record<string, Record<string, number>> = {};
    for (const row of res.rows) {
      const ch = row.channel;
      const month = String(row.forecast_month).slice(0, 7);
      if (!channelMonthTotals[ch]) channelMonthTotals[ch] = {};
      channelMonthTotals[ch][month] = (channelMonthTotals[ch][month] || 0) + Number(row.forecast_units);
    }

    // For each FBA, compute monthly forecast by applying country ratios
    for (const [fbaKey, config] of Object.entries(FBA_CONFIG)) {
      result[fbaKey] = {};

      for (const channel of ['B2C', 'Replacement', 'Marketplace']) {
        const countries = channel === 'Marketplace'
          ? config.marketplaceCountries
          : config.b2cReplacementCountries;

        let totalRatio = 0;
        for (const country of countries) {
          totalRatio += countryRatios[channel]?.[country] || 0;
        }

        if (totalRatio === 0) continue;

        const monthTotals = channelMonthTotals[channel] || {};
        for (const [month, units] of Object.entries(monthTotals)) {
          if (!result[fbaKey][month]) result[fbaKey][month] = {};
          result[fbaKey][month][channel] = (result[fbaKey][month][channel] || 0) + Math.round(units * totalRatio);
        }
      }
    }
  } catch {
    console.log('Could not fetch demand_forecasts, skipping monthly forecast');
  }

  return result;
}

function getStatus(days: number): 'critical' | 'warning' | 'healthy' {
  if (days < 15) return 'critical';
  if (days < 30) return 'warning';
  return 'healthy';
}

// GET / - FBA Replenishment Plan
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const targetDays = Number(req.query.targetDays) || 30;
    const now = Date.now();

    // Check cache
    if (cache && (now - cache.timestamp) < CACHE_TTL) {
      res.json(cache.data);
      return;
    }

    console.log('Computing FBA replenishment plan...');

    const [inventory, demandRows] = await Promise.all([
      fetchFBAInventory(),
      fetchDemandByCountry(),
    ]);

    const days = 30;

    // Build per-FBA demand: fbaKey -> sku -> { channels: { ch: rings }, totalRings }
    const fbaDemand: Record<string, Record<string, { channels: Record<string, number>; totalRings: number }>> = {};
    // Also track channel totals for country ratio computation
    const channelTotalRings: Record<string, number> = {};
    const channelCountryRings: Record<string, Record<string, number>> = {};

    for (const row of demandRows) {
      const { sku, channel, country, rings } = row;

      // Track channel totals for ratio computation
      channelTotalRings[channel] = (channelTotalRings[channel] || 0) + rings;
      if (!channelCountryRings[channel]) channelCountryRings[channel] = {};
      channelCountryRings[channel][country] = (channelCountryRings[channel][country] || 0) + rings;

      // Only allocate B2C, Replacement, Marketplace to FBAs
      if (!['B2C', 'Replacement', 'Marketplace'].includes(channel)) continue;

      for (const [fbaKey, config] of Object.entries(FBA_CONFIG)) {
        let serves = false;
        if (channel === 'Marketplace') {
          serves = config.marketplaceCountries.some(c => c === country);
        } else {
          serves = config.b2cReplacementCountries.some(c => c === country);
        }

        if (!serves) continue;

        // For Thailand (Shoppee + Lazada), split proportionally to stock
        if (country === 'THAILAND' && channel === 'Marketplace') {
          const shoppeeStock = Object.values(inventory.skuStock).reduce((s, m) => s + (m['Shoppee'] || 0), 0);
          const lazadaStock = Object.values(inventory.skuStock).reduce((s, m) => s + (m['Lazada'] || 0), 0);
          const totalThaiStock = shoppeeStock + lazadaStock;
          let ratio = 0.5; // default 50/50
          if (totalThaiStock > 0) {
            ratio = fbaKey === 'Shoppee' ? shoppeeStock / totalThaiStock : lazadaStock / totalThaiStock;
          }
          const allocatedRings = Math.round(rings * ratio);
          if (!fbaDemand[fbaKey]) fbaDemand[fbaKey] = {};
          if (!fbaDemand[fbaKey][sku]) fbaDemand[fbaKey][sku] = { channels: {}, totalRings: 0 };
          fbaDemand[fbaKey][sku].channels[channel] = (fbaDemand[fbaKey][sku].channels[channel] || 0) + allocatedRings;
          fbaDemand[fbaKey][sku].totalRings += allocatedRings;
          continue;
        }

        if (!fbaDemand[fbaKey]) fbaDemand[fbaKey] = {};
        if (!fbaDemand[fbaKey][sku]) fbaDemand[fbaKey][sku] = { channels: {}, totalRings: 0 };
        fbaDemand[fbaKey][sku].channels[channel] = (fbaDemand[fbaKey][sku].channels[channel] || 0) + rings;
        fbaDemand[fbaKey][sku].totalRings += rings;
      }
    }

    // Compute country ratios for monthly forecast allocation
    const countryRatios: Record<string, Record<string, number>> = {};
    for (const [channel, countryMap] of Object.entries(channelCountryRings)) {
      const total = channelTotalRings[channel] || 1;
      countryRatios[channel] = {};
      for (const [country, rings] of Object.entries(countryMap)) {
        countryRatios[channel][country] = rings / total;
      }
    }

    // Fetch monthly forecasts
    const monthlyForecasts = await fetchMonthlyForecasts(countryRatios);

    // Build FBA results
    const fbas = [];

    for (const [fbaKey, config] of Object.entries(FBA_CONFIG)) {
      const skuDemand = fbaDemand[fbaKey] || {};

      // Get all SKUs that have stock or demand for this FBA
      const allSkus = new Set<string>();
      for (const sku of Object.keys(inventory.skuStock)) {
        if ((inventory.skuStock[sku][config.inventoryColumnName] || 0) > 0) allSkus.add(sku);
      }
      for (const sku of Object.keys(skuDemand)) allSkus.add(sku);

      let fbaStock = 0;
      let fbaTotalRings = 0;
      const channelTotals: Record<string, number> = {};
      const skuDetails = [];

      for (const sku of allSkus) {
        const stock = inventory.skuStock[sku]?.[config.inventoryColumnName] || 0;
        const demand = skuDemand[sku] || { channels: {}, totalRings: 0 };
        const drr = demand.totalRings / days;

        fbaStock += stock;
        fbaTotalRings += demand.totalRings;

        for (const [ch, rings] of Object.entries(demand.channels)) {
          channelTotals[ch] = (channelTotals[ch] || 0) + rings;
        }

        const skuDaysOfCover = drr > 0 ? stock / drr : (stock > 0 ? 9999 : 0);
        const skuReplenishment = drr > 0 ? Math.max(0, Math.round(targetDays * drr - stock)) : 0;

        skuDetails.push({
          sku,
          ringType: getRingType(sku),
          currentStock: stock,
          dailyDemand: Math.round(drr * 100) / 100,
          daysOfCover: skuDaysOfCover >= 9999 ? 9999 : Math.round(skuDaysOfCover),
          status: getStatus(skuDaysOfCover >= 9999 ? 9999 : skuDaysOfCover),
          replenishmentNeeded: skuReplenishment,
          channelBreakdown: Object.fromEntries(
            Object.entries(demand.channels).map(([ch, rings]) => [ch, Math.round((rings / days) * 100) / 100])
          ),
        });
      }

      // Sort SKUs by days of cover ascending
      skuDetails.sort((a, b) => a.daysOfCover - b.daysOfCover);

      const fbaDRR = fbaTotalRings / days;
      const fbaDaysOfCover = fbaDRR > 0 ? fbaStock / fbaDRR : (fbaStock > 0 ? 9999 : 0);
      const fbaReplenishment = fbaDRR > 0 ? Math.max(0, Math.round(targetDays * fbaDRR - fbaStock)) : 0;

      // Monthly forecast for this FBA
      const fbaMonthly = monthlyForecasts[fbaKey] || {};
      const monthlyForecast = Object.entries(fbaMonthly)
        .map(([month, channels]) => ({
          month,
          forecastUnits: Object.values(channels).reduce((s, v) => s + v, 0),
          channelBreakdown: channels,
        }))
        .sort((a, b) => a.month.localeCompare(b.month))
        .slice(0, 3); // Next 3 months

      fbas.push({
        fbaName: config.name,
        geography: config.geoLabel,
        currentStock: fbaStock,
        dailyDemand: Math.round(fbaDRR * 100) / 100,
        daysOfCover: fbaDaysOfCover >= 9999 ? 9999 : Math.round(fbaDaysOfCover),
        status: getStatus(fbaDaysOfCover >= 9999 ? 9999 : fbaDaysOfCover),
        replenishmentNeeded: fbaReplenishment,
        channelBreakdown: Object.entries(channelTotals).map(([channel, rings]) => ({
          channel,
          dailyDemand: Math.round((rings / days) * 100) / 100,
        })),
        monthlyForecast,
        skus: skuDetails,
      });
    }

    // Sort by days of cover ascending (most critical first)
    fbas.sort((a, b) => a.daysOfCover - b.daysOfCover);

    const response = {
      summary: {
        totalFBAs: fbas.length,
        totalUnitsNeeded: fbas.reduce((s, f) => s + f.replenishmentNeeded, 0),
        criticalFBAs: fbas.filter(f => f.status === 'critical').length,
        warningFBAs: fbas.filter(f => f.status === 'warning').length,
        healthyFBAs: fbas.filter(f => f.status === 'healthy').length,
        targetDaysOfCover: targetDays,
      },
      fbas,
      lastUpdated: new Date().toISOString(),
    };

    cache = { data: response, timestamp: now };
    res.json(response);
  } catch (error) {
    console.error('Replenishment plan failed:', error);
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Failed to compute replenishment plan', detail: msg });
  }
});

export default router;
