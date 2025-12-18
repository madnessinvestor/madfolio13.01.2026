import Database from "better-sqlite3";
import bcrypt from "bcrypt";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../data/app.db");

export const db = new Database(dbPath);

// Enable foreign keys
db.pragma("foreign_keys = ON");

// Create users table if it doesn't exist
export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  console.log("[DB] Database initialized, users table created if not exists");
}

// Create default admin user if it doesn't exist
export function createDefaultAdmin() {
  const adminUsername = "admin";
  const adminEmail = "admin@localhost";
  const adminPassword = "admin123";
  
  const passwordHash = bcrypt.hashSync(adminPassword, 10);
  
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO users (username, email, password_hash, role)
    VALUES (?, ?, ?, 'admin')
  `);
  
  const result = stmt.run(adminUsername, adminEmail, passwordHash);
  
  if (result.changes > 0) {
    console.log(`[DB] Created default admin user: ${adminUsername}`);
  } else {
    console.log(`[DB] Admin user already exists`);
  }
}

// Export query helpers
export function query(sql) {
  return db.prepare(sql);
}

export function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

export function get(sql, params = []) {
  return db.prepare(sql).get(...params);
}

export function all(sql, params = []) {
  return db.prepare(sql).all(...params);
}
