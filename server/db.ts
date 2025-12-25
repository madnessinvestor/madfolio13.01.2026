import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import * as schema from "@shared/schema";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "../app.db");

console.log(`[DB] Initializing SQLite at: ${DB_PATH}`);

const sqlite = new Database(DB_PATH);
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("journal_mode = WAL");

// Run migrations
try {
  const tableInfo = sqlite
    .prepare("PRAGMA table_info(snapshots)")
    .all() as any[];
  const hasIsLockedColumn = tableInfo.some(
    (col: any) => col.name === "is_locked"
  );

  if (!hasIsLockedColumn) {
    console.log("[DB] Adding missing is_locked column to snapshots table...");
    sqlite.exec(`ALTER TABLE snapshots ADD COLUMN is_locked INTEGER DEFAULT 0`);
    console.log("[DB] ✓ is_locked column added successfully");
  }
} catch (error) {
  console.warn("[DB] Migration check/execution warning:", error);
}

// Add soft delete columns to wallets table
try {
  const walletTableInfo = sqlite
    .prepare("PRAGMA table_info(wallets)")
    .all() as any[];
  const hasIsDeletedColumn = walletTableInfo.some(
    (col: any) => col.name === "is_deleted"
  );
  const hasDeletedAtColumn = walletTableInfo.some(
    (col: any) => col.name === "deleted_at"
  );

  if (!hasIsDeletedColumn) {
    console.log("[DB] Adding is_deleted column to wallets table...");
    sqlite.exec(`ALTER TABLE wallets ADD COLUMN is_deleted INTEGER DEFAULT 0`);
    console.log("[DB] ✓ is_deleted column added successfully");
  }

  if (!hasDeletedAtColumn) {
    console.log("[DB] Adding deleted_at column to wallets table...");
    sqlite.exec(`ALTER TABLE wallets ADD COLUMN deleted_at INTEGER`);
    console.log("[DB] ✓ deleted_at column added successfully");
  }
} catch (error) {
  console.warn("[DB] Migration check/execution warning:", error);
}

// Add date column to monthly_portfolio_snapshots table if missing
try {
  const snapshotTableInfo = sqlite
    .prepare("PRAGMA table_info(monthly_portfolio_snapshots)")
    .all() as any[];
  const hasDateColumn = snapshotTableInfo.some(
    (col: any) => col.name === "date"
  );

  if (!hasDateColumn) {
    console.log(
      "[DB] Adding date column to monthly_portfolio_snapshots table..."
    );
    // Add the column with a temporary default, then we'll need to populate it
    sqlite.exec(
      `ALTER TABLE monthly_portfolio_snapshots ADD COLUMN date TEXT NOT NULL DEFAULT '2025-01-01'`
    );
    console.log("[DB] ✓ date column added successfully");

    // Update existing records to have proper date values
    console.log("[DB] Updating existing snapshot dates...");
    sqlite.exec(`
      UPDATE monthly_portfolio_snapshots 
      SET date = printf('%04d-%02d-01', year, month)
      WHERE date = '2025-01-01'
    `);
    console.log("[DB] ✓ Existing snapshot dates updated");
  }
} catch (error) {
  console.warn("[DB] Migration check/execution warning:", error);
}

export const db = drizzle(sqlite, { schema });

console.log(`[DB] ✓ SQLite initialized successfully`);
