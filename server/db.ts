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

export const db = drizzle(sqlite, { schema });

console.log(`[DB] ✓ SQLite initialized successfully`);
