import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text("user_id"),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  market: text("market").notNull(),
  currency: text("currency").notNull().default("BRL"),
  quantity: real("quantity").notNull().default(0),
  acquisitionPrice: real("acquisition_price").notNull().default(0),
  acquisitionDate: text("acquisition_date"),
  currentPrice: real("current_price"),
  lastPriceUpdate: integer("last_price_update", { mode: "timestamp" }),
  isDeleted: integer("is_deleted").default(0),
  deletedAt: integer("deleted_at", { mode: "timestamp" }),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  assetId: text("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  value: real("value").notNull(),
  amount: real("amount"),
  unitPrice: real("unit_price"),
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const insertSnapshotSchema = createInsertSchema(snapshots).omit({ id: true, createdAt: true });
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Snapshot = typeof snapshots.$inferSelect;

export const monthlyStatements = sqliteTable("monthly_statements", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  startValue: real("start_value").notNull().default(0),
  endValue: real("end_value").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const insertMonthlyStatementSchema = createInsertSchema(monthlyStatements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMonthlyStatement = z.infer<typeof insertMonthlyStatementSchema>;
export type MonthlyStatement = typeof monthlyStatements.$inferSelect;

export const wallets = sqliteTable("wallets", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text("user_id"),
  name: text("name").notNull(),
  link: text("link").notNull(),
  platform: text("platform").notNull().default("debank"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true, platform: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;

export const portfolioHistory = sqliteTable("portfolio_history", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text("user_id"),
  totalValue: real("total_value").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  date: text("date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const insertPortfolioHistorySchema = createInsertSchema(portfolioHistory).omit({ id: true, createdAt: true });
export type InsertPortfolioHistory = z.infer<typeof insertPortfolioHistorySchema>;
export type PortfolioHistory = typeof portfolioHistory.$inferSelect;

export const activityLogs = sqliteTable("activity_logs", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text("user_id"),
  type: text("type").notNull(),
  category: text("category").notNull(),
  assetId: text("asset_id"),
  assetName: text("asset_name"),
  assetSymbol: text("asset_symbol"),
  action: text("action").notNull(),
  details: text("details"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;
export type ActivityLog = typeof activityLogs.$inferSelect;
