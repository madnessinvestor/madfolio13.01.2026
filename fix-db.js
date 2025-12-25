import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "app.db");

console.log(`[DB Fix] Opening database at: ${DB_PATH}`);

const sqlite = new Database(DB_PATH);

try {
  // Drop the existing table with wrong constraint
  console.log('[DB Fix] Dropping monthly_portfolio_snapshots table...');
  sqlite.exec('DROP TABLE IF EXISTS monthly_portfolio_snapshots');
  console.log('[DB Fix] ✓ Table dropped');

  // Create table with correct constraint (month >= 1 AND month <= 12)
  console.log('[DB Fix] Creating monthly_portfolio_snapshots with corrected constraint...');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS monthly_portfolio_snapshots (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL DEFAULT 'default-user',
      year INTEGER NOT NULL,
      month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
      total_value REAL NOT NULL,
      date TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      is_locked INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, year, month)
    );
  `);
  console.log('[DB Fix] ✓ Table created with correct constraint');

  // Create indexes
  console.log('[DB Fix] Creating indexes...');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_user_year ON monthly_portfolio_snapshots(user_id, year)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_user_year_month ON monthly_portfolio_snapshots(user_id, year, month)');
  sqlite.exec('CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_date ON monthly_portfolio_snapshots(date)');
  console.log('[DB Fix] ✓ Indexes created');

  console.log('[DB Fix] ========================================');
  console.log('[DB Fix] ✅ Database fixed successfully!');
  console.log('[DB Fix] ========================================');
} catch (error) {
  console.error('[DB Fix] ✗ Error fixing database:', error);
  process.exit(1);
} finally {
  sqlite.close();
}
