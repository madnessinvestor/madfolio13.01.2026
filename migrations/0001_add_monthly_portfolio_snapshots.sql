-- Migration: Add monthly_portfolio_snapshots table
-- Created: 2025-12-25
-- Description: Creates table for storing monthly portfolio evolution snapshots

CREATE TABLE IF NOT EXISTS monthly_portfolio_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'default-user',
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  total_value REAL NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_locked INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, year, month)
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_user_year ON monthly_portfolio_snapshots(user_id, year);
CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_user_year_month ON monthly_portfolio_snapshots(user_id, year, month);
CREATE INDEX IF NOT EXISTS idx_monthly_snapshots_date ON monthly_portfolio_snapshots(date);
