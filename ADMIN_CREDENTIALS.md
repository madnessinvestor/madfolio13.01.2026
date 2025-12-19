# Admin Credentials & Database Backup

**Created:** 2025-12-19

## Admin Accounts

This file contains a backup of all admin accounts for recovery purposes. The complete database backup is stored in `app.db` (SQLite).

### 🔐 Primary Admin Account

- **Username:** `madnessinvestor`
- **Email:** `madnessinvestor@yahoo.com`
- **Password:** `2512pcxm` ⭐
- **Role:** admin
- **Created:** 2025-12-18
- **Status:** ✅ Active

### Backup Admin Account

- **Username:** `admin`
- **Email:** `admin@portfoliotracker.local`
- **Role:** admin
- **Created:** 2025-12-19
- **Status:** For recovery only

## Database Location

- **Main Database:** `./app.db` (SQLite)
- **Backup Database:** `./data/app.db`
- **Admin Seed File:** `admin-seed.json`

## Database Schema

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

## Backup Instructions

To backup the database:
```bash
cp ./app.db ./backups/app-$(date +%Y%m%d-%H%M%S).db
```

To restore from backup:
```bash
cp ./backups/app-YYYYMMDD-HHMMSS.db ./app.db
```

## Notes

- All passwords are hashed using bcrypt
- Database file contains all user data, portfolios, and historical data
- This is a critical file for application recovery
- Keep backups in version control for safety

---

**Status:** ✅ Database verified and functional
**Last Updated:** 2025-12-19 10:12:10
