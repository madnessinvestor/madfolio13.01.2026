import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const assets = pgTable("assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  market: text("market").notNull(),
  currency: text("currency").notNull().default("BRL"),
  quantity: real("quantity").notNull().default(0),
  acquisitionPrice: real("acquisition_price").notNull().default(0),
  acquisitionDate: date("acquisition_date"),
  currentPrice: real("current_price"),
  lastPriceUpdate: timestamp("last_price_update"),
  isDeleted: integer("is_deleted").default(0),
  deletedAt: timestamp("deleted_at"),
});

export const insertAssetSchema = createInsertSchema(assets).omit({ id: true });
export type InsertAsset = z.infer<typeof insertAssetSchema>;
export type Asset = typeof assets.$inferSelect;

export const snapshots = pgTable("snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  assetId: varchar("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  value: real("value").notNull(),
  amount: real("amount"),
  unitPrice: real("unit_price"),
  date: date("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSnapshotSchema = createInsertSchema(snapshots).omit({ id: true, createdAt: true });
export type InsertSnapshot = z.infer<typeof insertSnapshotSchema>;
export type Snapshot = typeof snapshots.$inferSelect;

export const monthlyStatements = pgTable("monthly_statements", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  startValue: real("start_value").notNull().default(0),
  endValue: real("end_value").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertMonthlyStatementSchema = createInsertSchema(monthlyStatements).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMonthlyStatement = z.infer<typeof insertMonthlyStatementSchema>;
export type MonthlyStatement = typeof monthlyStatements.$inferSelect;

export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  name: text("name").notNull(),
  link: text("link").notNull(),
  platform: text("platform").notNull().default("debank"), // debank, step
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true, platform: true });
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;
