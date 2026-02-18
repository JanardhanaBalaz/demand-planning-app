import { Router, Request, Response } from 'express';
import { query } from '../models/db.js';

const router = Router();

const SHEET_ID = '1TyFHESP7lIrvFuH8BNFrTISaB5uo_FZ4okMUHsffcCs';
const GID = '760538939'; // Tab: Network

interface NetworkRule {
  id?: number;
  location: string;
  whOrFactory: string;
  region: string;
  channel: string;
  destinationCountry: string;
  shipmentType: string;
  isActive: boolean;
  priority: number;
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
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

// Fetch network rules from Google Sheet
async function fetchNetworkFromSheet(): Promise<NetworkRule[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${GID}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch sheet: ${resp.status}`);

  const text = await resp.text();
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Skip first 2 header rows (empty row + "Can fulfil Rings to" row), then row 3 is actual header
  const rules: NetworkRule[] = [];
  let priority = 1;

  for (let i = 3; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const location = (cells[0] || '').trim();
    if (!location || location === '' || location.startsWith('List of')) break;

    const whOrFactory = (cells[1] || '').trim();
    const region = (cells[2] || '').trim();
    const channel = (cells[3] || '').trim();
    const destination = (cells[4] || '').trim();
    const shipmentType = (cells[5] || '').trim();

    if (!channel || !destination) continue;

    rules.push({
      location,
      whOrFactory,
      region,
      channel,
      destinationCountry: destination,
      shipmentType,
      isActive: true,
      priority: priority++,
    });
  }

  return rules;
}

// GET / - Return all network rules (from DB if synced, else from sheet)
router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Check if DB table exists and has data
    const dbResult = await query(
      `SELECT id, location, wh_or_factory as "whOrFactory", region, channel,
       destination_country as "destinationCountry", shipment_type as "shipmentType",
       is_active as "isActive", priority
       FROM network_rules ORDER BY priority`
    ).catch(() => null);

    if (dbResult && dbResult.rows.length > 0) {
      res.json({ rules: dbResult.rows, source: 'database' });
      return;
    }

    // Fallback to sheet
    const rules = await fetchNetworkFromSheet();
    res.json({ rules, source: 'sheet' });
  } catch (error) {
    console.error('Failed to fetch network rules:', error);
    res.status(500).json({ message: 'Failed to fetch network rules' });
  }
});

// POST /sync - Import rules from Google Sheet into DB
router.post('/sync', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rules = await fetchNetworkFromSheet();

    // Clear existing and re-insert
    await query('DELETE FROM network_rules');

    for (const rule of rules) {
      await query(
        `INSERT INTO network_rules (location, wh_or_factory, region, channel, destination_country, shipment_type, is_active, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [rule.location, rule.whOrFactory, rule.region, rule.channel, rule.destinationCountry, rule.shipmentType, true, rule.priority]
      );
    }

    res.json({ message: 'Synced from sheet', count: rules.length });
  } catch (error) {
    console.error('Failed to sync rules:', error);
    res.status(500).json({ message: 'Failed to sync rules from sheet' });
  }
});

// PUT /:id - Update a rule (toggle active, change priority, etc.)
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { isActive, priority } = req.body;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIdx++}`);
      values.push(isActive);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIdx++}`);
      values.push(priority);
    }

    if (updates.length === 0) {
      res.status(400).json({ message: 'No fields to update' });
      return;
    }

    values.push(id);
    await query(
      `UPDATE network_rules SET ${updates.join(', ')} WHERE id = $${paramIdx}`,
      values
    );

    res.json({ message: 'Rule updated' });
  } catch (error) {
    console.error('Failed to update rule:', error);
    res.status(500).json({ message: 'Failed to update rule' });
  }
});

export default router;
