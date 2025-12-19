import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import bcrypt from "bcrypt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, "../app.db");

export const sqliteDb = new Database(DB_PATH);

// Enable foreign keys
sqliteDb.pragma("foreign_keys = ON");

export function initializeDatabase() {
  // Create users table if it doesn't exist
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create default admin user if it doesn't exist
  const adminUsername = "madnessinvestor";
  const adminEmail = "madnessinvestor@yahoo.com";
  const adminPassword = "123456"; // Default password

  const existingAdmin = sqliteDb
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(adminUsername);

  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync(adminPassword, 10);
    sqliteDb
      .prepare(
        "INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)"
      )
      .run(adminUsername, adminEmail, passwordHash, "admin");

    console.log(`[SQLite] Created default admin user: ${adminUsername}`);
  }
}

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
}

export function getUserByUsernameOrEmail(
  usernameOrEmail: string
): User | undefined {
  return sqliteDb
    .prepare(
      "SELECT * FROM users WHERE username = ? OR email = ? LIMIT 1"
    )
    .get(usernameOrEmail, usernameOrEmail) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  return sqliteDb
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as User | undefined;
}
