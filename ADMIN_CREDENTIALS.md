# Admin Credentials & Database Backup

**Created:** 2025-12-19
**Updated:** 2025-12-19 10:45 UTC

## Admin Account

This file contains the admin account credentials for Portfolio Tracker. The complete database is stored in `app.db` (SQLite) and PostgreSQL.

### 🔐 Primary Admin Account

- **Username:** `madnessinvestor`
- **Email:** `madnessinvestor@yahoo.com`
- **Password:** `123456` ⭐
- **Role:** admin
- **Profile Image:** `/avatars/madnessinvestor.png`
- **Created:** 2025-12-19
- **Status:** ✅ Active

## Database Files

- **Main Database (SQLite):** `./app.db` - Contains all local data
- **Admin Seed File:** `admin-seed.json` - Admin account backup
- **PostgreSQL:** Uses DATABASE_URL environment variable (Neon)

## Database Schema (SQLite)

```
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## PostgreSQL Tables

- `users` - User accounts with profiles
- `sessions` - Session storage (Replit Auth)
- `assets` - Investment assets (crypto, stocks, fixed income)
- `snapshots` - Asset value snapshots
- `wallets` - Cryptocurrency wallets
- `portfolio_history` - Monthly portfolio history
- `activity_logs` - User action logs
- `monthly_statements` - Monthly portfolio statements

## Restoring the Database

### SQLite
```bash
# The app.db file contains all user and portfolio data
# Simply copy it to restore:
cp app.db ./app.db
```

### PostgreSQL
```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://user:password@host:port/database"

# Sync database schema
npm run db:push

# Optionally create admin user
npm run seed:admin
```

## Security Notes

- ⚠️ **This file contains sensitive information - keep it private**
- All passwords are hashed using bcrypt (10 rounds)
- This repository should be PRIVATE
- Change the admin password immediately after first login
- Use strong, unique passwords for production

## Backup Instructions

```bash
# Backup SQLite database
cp ./app.db ./backups/app-$(date +%Y%m%d-%H%M%S).db

# Backup all data
tar -czf portfolio-tracker-backup-$(date +%Y%m%d-%H%M%S).tar.gz \
  app.db admin-seed.json ADMIN_CREDENTIALS.md
```

## Restore Instructions

```bash
# Restore from SQLite backup
cp ./backups/app-YYYYMMDD-HHMMSS.db ./app.db

# Or restore from full backup
tar -xzf portfolio-tracker-backup-YYYYMMDD-HHMMSS.tar.gz
```

## Quick Start After Clone

```bash
# Install dependencies
npm install

# Sync database
npm run db:push

# Create admin user (if using PostgreSQL)
npm run seed:admin

# Start development server
npm run dev
```
# Esse login não exite mais
Login with:
- Username: `madnessinvestor` 
- Password: `123456`

---

**Status:** ✅ Database verified and functional
**Last Updated:** 2025-12-19 10:45:00 UTC
**Environment:** Development with SQLite + PostgreSQL support
