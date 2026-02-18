import { Router, Request, Response } from 'express';
import { query } from '../models/db.js';

const router = Router();

const CHANNEL_GROUPS: Record<string, string[]> = {
  'B2C': ['B2C'],
  'Replacement': ['Replacement'],
  'Retail': ['Retail'],
  'Marketplace': ['Marketplace'],
};

const METABASE_URL = process.env.METABASE_URL || 'https://metabase.ultrahuman.com';
const METABASE_API_KEY = process.env.METABASE_API_KEY || '';

async function fetchQ19170(startDate: string, endDate: string): Promise<Record<string, unknown>[]> {
  // Use /query/json endpoint to bypass the 2,000 row limit
  const url = `${METABASE_URL}/api/card/19170/query/json`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': METABASE_API_KEY,
    },
    body: JSON.stringify({
      parameters: [
        { type: 'date/single', target: ['variable', ['template-tag', 'start_date']], value: startDate },
        { type: 'date/single', target: ['variable', ['template-tag', 'end_date']], value: endDate },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Metabase Q19170 failed: ${resp.status} - ${text}`);
  }

  return await resp.json() as Record<string, unknown>[];
}

// EU sub-countries that don't appear separately in Q19170 NEW_COUNTRY_BUCKET
// Their demand is aggregated under "EUROPE UNION". We split proportionally using card 9434.
const EU_SUB_COUNTRIES = ['FRANCE', 'GERMANY', 'NETHERLANDS'];

// Countries that have their own NEW_COUNTRY_BUCKET in Q19170
const EXPLICIT_COUNTRIES = [
  'UNITED STATES', 'CANADA', 'EUROPE UNION', 'UNITED KINGDOM', 'AUSTRALIA',
  'INDIA', 'UNITED ARAB EMIRATES', 'SINGAPORE', 'JAPAN', 'SAUDI ARABIA',
];

// Fetch card 9434 (Retail B2C SKU distribution by country) to get EU sub-country proportions
async function fetchEuCountryProportions(): Promise<Record<string, Record<string, number>>> {
  const url = `${METABASE_URL}/api/card/9434/query/json`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': METABASE_API_KEY },
    body: JSON.stringify({}),
  });
  if (!resp.ok) throw new Error(`Metabase card 9434 failed: ${resp.status}`);
  const rows = await resp.json() as Record<string, unknown>[];

  // Map country names to normalised form
  const countryNorm: Record<string, string> = {
    'THE NETHERLANDS': 'NETHERLANDS',
    'CZECH REPUBLIC': 'CZECHIA',
  };

  // Build per-SKU per-country ring counts for EU countries
  const skuCountryRings: Record<string, Record<string, number>> = {};
  let totalEuRings = 0;
  for (const row of rows) {
    let country = String(row['COUNTRY'] || '').toUpperCase().trim();
    country = countryNorm[country] || country;
    const sku = String(row['SKU'] || '');
    const rings = Number(row['RING_COUNT'] || 0);

    // Check if this is an EU country (not UK, not non-EU)
    const euCountries = [
      'GERMANY', 'NETHERLANDS', 'FRANCE', 'CZECHIA', 'SPAIN', 'BELGIUM', 'ITALY',
      'POLAND', 'AUSTRIA', 'IRELAND', 'PORTUGAL', 'SWEDEN', 'DENMARK', 'SLOVAKIA',
      'LITHUANIA', 'HUNGARY', 'ROMANIA', 'CYPRUS', 'ESTONIA', 'GREECE', 'LUXEMBOURG',
      'FINLAND', 'LATVIA', 'SLOVENIA', 'BULGARIA', 'CROATIA', 'MALTA', 'STRAKONICE',
    ];
    if (!euCountries.includes(country)) continue;

    if (!skuCountryRings[sku]) skuCountryRings[sku] = {};
    skuCountryRings[sku][country] = (skuCountryRings[sku][country] || 0) + rings;
    totalEuRings += rings;
  }

  // Compute per-country total and proportion
  const countryTotals: Record<string, number> = {};
  for (const sku of Object.keys(skuCountryRings)) {
    for (const [country, rings] of Object.entries(skuCountryRings[sku])) {
      countryTotals[country] = (countryTotals[country] || 0) + rings;
    }
  }

  // Return proportions: { FRANCE: { SKU: proportion_of_eu_total }, ... }
  // Also compute per-SKU proportion within each target country
  const result: Record<string, Record<string, number>> = {};
  for (const targetCountry of EU_SUB_COUNTRIES) {
    result[targetCountry] = {};
    const countryTotal = countryTotals[targetCountry] || 0;
    const countryProportion = totalEuRings > 0 ? countryTotal / totalEuRings : 0;
    result[targetCountry]['__proportion__'] = countryProportion;

    for (const [sku, countryMap] of Object.entries(skuCountryRings)) {
      const skuRingsInCountry = countryMap[targetCountry] || 0;
      if (skuRingsInCountry > 0 && countryTotal > 0) {
        result[targetCountry][sku] = skuRingsInCountry / countryTotal;
      }
    }
  }

  return result;
}

let euProportionsCache: { data: Record<string, Record<string, number>>; ts: number } | null = null;

async function getEuProportions(): Promise<Record<string, Record<string, number>>> {
  if (euProportionsCache && Date.now() - euProportionsCache.ts < 30 * 60 * 1000) {
    return euProportionsCache.data;
  }
  const data = await fetchEuCountryProportions();
  euProportionsCache = { data, ts: Date.now() };
  return data;
}

// GET /channels - Returns all channel groups
router.get('/channels', (_req: Request, res: Response): void => {
  res.json({ channels: Object.keys(CHANNEL_GROUPS) });
});

// POST /baseline - Query Metabase Q19170 live with date range, region, ring basis
router.post('/baseline', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, countryBucket, channelGroup, ringBasis } = req.body;

    if (!startDate || !endDate || !channelGroup) {
      res.status(400).json({ message: 'startDate, endDate, and channelGroup are required' });
      return;
    }

    if (channelGroup === 'Retail' && !countryBucket) {
      res.status(400).json({ message: 'countryBucket is required for this channel' });
      return;
    }

    const channelValues = CHANNEL_GROUPS[channelGroup];
    if (!channelValues) {
      res.status(400).json({ message: `Invalid channel group: ${channelGroup}` });
      return;
    }

    console.log(`Fetching Q19170: ${startDate} to ${endDate}, channel=${channelGroup}, country=${countryBucket}`);
    const rows = await fetchQ19170(startDate, endDate);
    console.log(`Q19170 returned ${rows.length} rows`);

    // Filter rows by channel (and optionally by country bucket)
    // Q19170 columns: SKU, CHANNEL, "With Charger or Without Charger?", NEW_COUNTRY_BUCKET, RING_COUNT, TOTAL_DAYS, DRR
    const skipCountryFilter = channelGroup === 'B2C' || channelGroup === 'Replacement' || channelGroup === 'Marketplace';

    // Wabi Sabi SKU prefixes — exclude from B2C
    const WABI_SABI_PREFIXES = ['WA', 'WG', 'WM', 'WR', 'WS', 'WT'];

    const filtered = rows.filter((row) => {
      const rowChannel = String(row['CHANNEL'] || '');
      const channelMatch = channelValues.some(ch => rowChannel.toLowerCase() === ch.toLowerCase());
      if (!channelMatch) return false;

      // Exclude Wabi Sabi SKUs from B2C
      if (channelGroup === 'B2C') {
        const sku = String(row['SKU'] || '');
        const prefix = sku.slice(0, 2).toUpperCase();
        if (WABI_SABI_PREFIXES.includes(prefix)) return false;
      }

      if (skipCountryFilter) {
        return true;
      }

      const rowCountry = String(row['NEW_COUNTRY_BUCKET'] || '');
      const countryMatch = rowCountry.toLowerCase() === countryBucket.toLowerCase();

      return countryMatch;
    });

    console.log(`Filtered to ${filtered.length} rows for ${channelGroup} / ${countryBucket}`);

    // Calculate date range days
    const start = new Date(startDate);
    const end = new Date(endDate);
    const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

    // Aggregate total rings and per-SKU breakdown
    let totalRings = 0;
    let skuMap: Record<string, number> = {};

    for (const row of filtered) {
      const rings = Number(row['RING_COUNT'] || 0);
      const sku = String(row['SKU'] || 'Unknown');

      totalRings += rings;
      skuMap[sku] = (skuMap[sku] || 0) + rings;
    }

    // EU sub-country handling: split EUROPE UNION data proportionally
    let fallbackRegion: string | null = null;
    const upperBucket = (countryBucket || '').toUpperCase();

    if (totalRings === 0 && EU_SUB_COUNTRIES.includes(upperBucket)) {
      console.log(`No direct data for ${channelGroup}/${countryBucket}, splitting from EUROPE UNION`);
      fallbackRegion = 'EUROPE UNION (proportional split)';

      // Get EUROPE UNION data
      const euFiltered = rows.filter((row) => {
        const rowChannel = String(row['CHANNEL'] || '');
        const channelMatch = channelValues.some(ch => rowChannel.toLowerCase() === ch.toLowerCase());
        if (!channelMatch) return false;
        if (channelGroup === 'B2C') {
          const sku = String(row['SKU'] || '');
          if (WABI_SABI_PREFIXES.includes(sku.slice(0, 2).toUpperCase())) return false;
        }
        const rowCountry = String(row['NEW_COUNTRY_BUCKET'] || '');
        return rowCountry.toUpperCase() === 'EUROPE UNION';
      });

      // Get EU proportions from card 9434
      const euProps = await getEuProportions();
      const countryProps = euProps[upperBucket] || {};
      const countryProportion = countryProps['__proportion__'] || 0;

      console.log(`${upperBucket} proportion of EU: ${(countryProportion * 100).toFixed(1)}%`);

      // Aggregate EU rings per SKU, then apply country proportion
      const euSkuMap: Record<string, number> = {};
      let euTotalRings = 0;
      for (const row of euFiltered) {
        const rings = Number(row['RING_COUNT'] || 0);
        const sku = String(row['SKU'] || 'Unknown');
        euTotalRings += rings;
        euSkuMap[sku] = (euSkuMap[sku] || 0) + rings;
      }

      // Apply proportion per SKU: use per-SKU country weight if available, else overall proportion
      totalRings = 0;
      skuMap = {};
      for (const [sku, euRings] of Object.entries(euSkuMap)) {
        // Per-SKU proportion from card 9434 (if the SKU exists in that country)
        const skuWeight = countryProps[sku];
        // If we have per-SKU weight, apply it to the EU total for this SKU
        // Otherwise use the overall country proportion
        const proportion = skuWeight !== undefined
          ? skuWeight * (countryProportion > 0 ? 1 : 0)  // skuWeight is already relative to country total
          : countryProportion;

        // skuWeight is (country_sku_rings / country_total_rings)
        // We want: sku_rings_for_country = EU_sku_rings * (country_share_of_EU)
        const allocatedRings = Math.round(euRings * countryProportion);
        if (allocatedRings > 0) {
          skuMap[sku] = allocatedRings;
          totalRings += allocatedRings;
        }
      }

      console.log(`${upperBucket} split: ${euFiltered.length} EU rows, ${euTotalRings} EU rings → ${totalRings} allocated`);
    }

    // EUROPE UNION handling: subtract FR/DE/NL proportions so it represents "rest of EU"
    if (upperBucket === 'EUROPE UNION' && totalRings > 0) {
      try {
        const euProps = await getEuProportions();
        let subCountryProportion = 0;
        for (const subCountry of EU_SUB_COUNTRIES) {
          subCountryProportion += (euProps[subCountry]?.['__proportion__'] || 0);
        }
        const remainingProportion = Math.max(0, 1 - subCountryProportion);
        console.log(`EUROPE UNION: subtracting ${(subCountryProportion * 100).toFixed(1)}% for FR/DE/NL, keeping ${(remainingProportion * 100).toFixed(1)}%`);

        const originalTotal = totalRings;
        totalRings = 0;
        const newSkuMap: Record<string, number> = {};
        for (const [sku, rings] of Object.entries(skuMap)) {
          const adjusted = Math.round(rings * remainingProportion);
          if (adjusted > 0) {
            newSkuMap[sku] = adjusted;
            totalRings += adjusted;
          }
        }
        skuMap = newSkuMap;
        console.log(`EUROPE UNION adjusted: ${originalTotal} → ${totalRings} rings`);
      } catch (e) {
        console.warn('Failed to adjust EUROPE UNION proportions, using full data:', e);
      }
    }

    // ROW handling: always aggregate all countries not explicitly listed
    if (upperBucket === 'ROW') {
      console.log(`Computing ROW as aggregate of unlisted countries for ${channelGroup}`);
      fallbackRegion = 'ROW (aggregated)';

      const rowFiltered = rows.filter((row) => {
        const rowChannel = String(row['CHANNEL'] || '');
        const channelMatch = channelValues.some(ch => rowChannel.toLowerCase() === ch.toLowerCase());
        if (!channelMatch) return false;
        if (channelGroup === 'B2C') {
          const sku = String(row['SKU'] || '');
          if (WABI_SABI_PREFIXES.includes(sku.slice(0, 2).toUpperCase())) return false;
        }
        const rowCountry = String(row['NEW_COUNTRY_BUCKET'] || '').toUpperCase();
        // ROW = everything not in explicit countries and not EU sub-countries
        return !EXPLICIT_COUNTRIES.includes(rowCountry);
      });

      totalRings = 0;
      skuMap = {};
      for (const row of rowFiltered) {
        const rings = Number(row['RING_COUNT'] || 0);
        const sku = String(row['SKU'] || 'Unknown');
        totalRings += rings;
        skuMap[sku] = (skuMap[sku] || 0) + rings;
      }
      console.log(`ROW aggregate: ${rowFiltered.length} rows, ${totalRings} rings`);
    }

    const baselineDrr = totalRings / days;

    // Per-SKU breakdown with auto weight %
    const skuBreakdown = Object.entries(skuMap).map(([sku, rings]) => ({
      sku,
      rings,
      autoWeightPct: totalRings > 0 ? (rings / totalRings) * 100 : 0,
    }));

    skuBreakdown.sort((a, b) => b.rings - a.rings);

    res.json({
      baselineDrr,
      totalRings,
      days,
      channelGroup,
      countryBucket,
      fallbackRegion,
      ringBasis: ringBasis || 'activated',
      startDate,
      endDate,
      skuBreakdown,
    });
  } catch (error) {
    console.error('Failed to fetch baseline:', error);
    res.status(500).json({ message: 'Failed to fetch baseline data from Metabase' });
  }
});

// GET /settings - Retrieve saved forecast settings for a channel+region
router.get('/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelGroup, countryBucket } = req.query;

    if (!channelGroup || !countryBucket) {
      res.status(400).json({ message: 'channelGroup and countryBucket are required' });
      return;
    }

    const settingsResult = await query(
      `SELECT id, channel_group as "channelGroup", country_bucket as "countryBucket",
       forecast_month as "forecastMonth", baseline_drr as "baselineDrr",
       lift_pct as "liftPct", mom_growth_pct as "momGrowthPct",
       distribution_method as "distributionMethod",
       baseline_start_date as "baselineStartDate", baseline_end_date as "baselineEndDate",
       ring_basis as "ringBasis", updated_at as "updatedAt"
       FROM channel_forecast_settings
       WHERE channel_group = $1 AND country_bucket = $2
       ORDER BY forecast_month`,
      [channelGroup, countryBucket]
    );

    const skuResult = await query(
      `SELECT id, channel_group as "channelGroup", country_bucket as "countryBucket",
       sku, auto_weight_pct as "autoWeightPct", manual_weight_pct as "manualWeightPct",
       is_override as "isOverride"
       FROM channel_sku_distribution
       WHERE channel_group = $1 AND country_bucket = $2
       ORDER BY auto_weight_pct DESC`,
      [channelGroup, countryBucket]
    );

    res.json({
      settings: settingsResult.rows,
      skuDistribution: skuResult.rows,
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    res.status(500).json({ message: 'Failed to fetch forecast settings' });
  }
});

// PUT /settings - Save lift%, growth%, distribution method for 12 months
router.put('/settings', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelGroup, countryBucket, months } = req.body;

    if (!channelGroup || !countryBucket || !Array.isArray(months)) {
      res.status(400).json({ message: 'channelGroup, countryBucket, and months array are required' });
      return;
    }

    for (const month of months) {
      await query(
        `INSERT INTO channel_forecast_settings
         (channel_group, country_bucket, forecast_month, baseline_drr, lift_pct, mom_growth_pct,
          distribution_method, baseline_start_date, baseline_end_date, ring_basis, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (channel_group, country_bucket, forecast_month)
         DO UPDATE SET
           baseline_drr = EXCLUDED.baseline_drr,
           lift_pct = EXCLUDED.lift_pct,
           mom_growth_pct = EXCLUDED.mom_growth_pct,
           distribution_method = EXCLUDED.distribution_method,
           baseline_start_date = EXCLUDED.baseline_start_date,
           baseline_end_date = EXCLUDED.baseline_end_date,
           ring_basis = EXCLUDED.ring_basis,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [
          channelGroup, countryBucket, month.forecastMonth,
          month.baselineDrr || 0, month.liftPct || 0, month.momGrowthPct || 0,
          month.distributionMethod || 'historical',
          month.baselineStartDate || null, month.baselineEndDate || null,
          month.ringBasis || 'activated', null,
        ]
      );
    }

    res.json({ message: 'Settings saved', count: months.length });
  } catch (error) {
    console.error('Failed to save settings:', error);
    res.status(500).json({ message: 'Failed to save forecast settings' });
  }
});

// PUT /sku-distribution - Save SKU weight overrides
router.put('/sku-distribution', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelGroup, countryBucket, skus } = req.body;

    if (!channelGroup || !countryBucket || !Array.isArray(skus)) {
      res.status(400).json({ message: 'channelGroup, countryBucket, and skus array are required' });
      return;
    }

    for (const sku of skus) {
      await query(
        `INSERT INTO channel_sku_distribution
         (channel_group, country_bucket, sku, auto_weight_pct, manual_weight_pct, is_override, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         ON CONFLICT (channel_group, country_bucket, sku)
         DO UPDATE SET
           auto_weight_pct = EXCLUDED.auto_weight_pct,
           manual_weight_pct = EXCLUDED.manual_weight_pct,
           is_override = EXCLUDED.is_override,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()`,
        [
          channelGroup, countryBucket, sku.sku,
          sku.autoWeightPct || 0,
          sku.manualWeightPct !== undefined && sku.manualWeightPct !== null ? sku.manualWeightPct : null,
          sku.isOverride || false,
          null,
        ]
      );
    }

    res.json({ message: 'SKU distribution saved', count: skus.length });
  } catch (error) {
    console.error('Failed to save SKU distribution:', error);
    res.status(500).json({ message: 'Failed to save SKU distribution' });
  }
});

// POST /save-forecasts - Materialize forecasts into demand_forecasts table
router.post('/save-forecasts', async (req: Request, res: Response): Promise<void> => {
  try {
    const { channelGroup, countryBucket, forecasts } = req.body;

    if (!channelGroup || !countryBucket || !Array.isArray(forecasts)) {
      res.status(400).json({ message: 'channelGroup, countryBucket, and forecasts array are required' });
      return;
    }

    // Delete existing forecasts before inserting fresh data
    // For non-Retail channels, clear ALL entries for the channel (regardless of country_bucket)
    // For Retail, clear only the specific region
    const noRegionChannels = ['B2C', 'Replacement', 'Marketplace'];
    if (noRegionChannels.includes(channelGroup)) {
      await query(
        `DELETE FROM demand_forecasts WHERE channel = $1`,
        [channelGroup]
      );
    } else {
      await query(
        `DELETE FROM demand_forecasts WHERE channel = $1 AND country_bucket = $2`,
        [channelGroup, countryBucket]
      );
    }

    let insertedCount = 0;

    for (const forecast of forecasts) {
      await query(
        `INSERT INTO demand_forecasts
         (channel, channel_group, country_bucket, sku, forecast_month, forecast_units, created_by, created_at, updated_by, updated_at)
         VALUES ($1, $1, $2, $3, $4, $5, $6, NOW(), $6, NOW())`,
        [channelGroup, countryBucket, forecast.sku, forecast.forecastMonth, forecast.forecastUnits || 0, null]
      );
      insertedCount++;
    }

    res.json({ message: 'Forecasts saved', count: insertedCount });
  } catch (error) {
    console.error('Failed to save forecasts:', error);
    res.status(500).json({ message: 'Failed to save forecasts' });
  }
});

// GET /forecast-summary - Read saved forecasts grouped by channel, month, SKU
router.get('/forecast-summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT
         channel_group as "channelGroup",
         country_bucket as "countryBucket",
         sku,
         TO_CHAR(forecast_month, 'YYYY-MM-DD') as "forecastMonth",
         forecast_units as "forecastUnits",
         updated_at as "updatedAt"
       FROM demand_forecasts
       ORDER BY channel_group, country_bucket, forecast_month, sku`
    );

    // Get completeness info per channel
    const statusResult = await query(
      `SELECT
         channel_group as "channelGroup",
         ARRAY_AGG(DISTINCT country_bucket) as "regions",
         COUNT(DISTINCT TO_CHAR(forecast_month, 'YYYY-MM')) as "monthCount",
         MAX(updated_at) as "lastUpdated"
       FROM demand_forecasts
       GROUP BY channel_group`
    );

    res.json({
      forecasts: result.rows,
      channelStatus: statusResult.rows,
    });
  } catch (error) {
    console.error('Failed to fetch forecast summary:', error);
    res.status(500).json({ message: 'Failed to fetch forecast summary' });
  }
});

export default router;
