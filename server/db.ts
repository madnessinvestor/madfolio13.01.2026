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
  const tableInfo = sqlite.prepare("PRAGMA table_info(snapshots)").all() as any[];
  const hasIsLockedColumn = tableInfo.some((col: any) => col.name === 'is_locked');
  
  if (!hasIsLockedColumn) {
    console.log('[DB] Adding missing is_locked column to snapshots table...');
    sqlite.exec(`ALTER TABLE snapshots ADD COLUMN is_locked INTEGER DEFAULT 0`);
    console.log('[DB] ✓ is_locked column added successfully');
  }
} catch (error) {
  console.warn('[DB] Migration check/execution warning:', error);
}

export const db = drizzle(sqlite, { schema });

console.log(`[DB] ✓ SQLite initialized successfully`);
