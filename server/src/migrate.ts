import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './models/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  try {
    console.log('Running database migrations...');

    // Support both dev (../../database/migrations) and Docker production (/app/migrations)
    const devPath = path.join(__dirname, '../../database/migrations');
    const prodPath = path.join(__dirname, '../migrations');
    const migrationsDir = fs.existsSync(devPath) ? devPath : prodPath;
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

    let hasErrors = false;
    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      try {
        await pool.query(sql);
        console.log(`Completed: ${file}`);
      } catch (err) {
        console.warn(`Warning: ${file} had errors (may be safe to ignore if tables already exist):`, (err as Error).message);
        hasErrors = true;
      }
    }

    console.log(hasErrors ? 'Migrations completed with warnings.' : 'All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
