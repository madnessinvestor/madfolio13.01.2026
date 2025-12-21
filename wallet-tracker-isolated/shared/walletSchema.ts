import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { z } from "zod";

// Wallet table schema
export const wallets = sqliteTable("wallets", {
  id: text("id").primaryKey().default(sql`lower(hex(randomblob(16)))`),
  userId: text("user_id"),
  name: text("name").notNull(),
  link: text("link").notNull(),
  platform: text("platform").notNull().default("debank"),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`(unixepoch())`),
});

// Zod schemas for validation
export const insertWalletSchema = createInsertSchema(wallets).omit({ id: true, createdAt: true, platform: true });

// TypeScript types
export type InsertWallet = z.infer<typeof insertWalletSchema>;
export type Wallet = typeof wallets.$inferSelect;

// Additional types used by the Wallet Tracker
export interface WalletBalance {
  id: string;
  name: string;
  link: string;
  balance: string;
  lastUpdated: string;
  status: "success" | "temporary_error" | "unavailable";
  error?: string;
  lastKnownValue?: string;
}

export interface WalletHistoryEntry {
  timestamp: string;
  balance: string;
  status: string;
  platform?: string;
}

export interface WalletStats {
  currentBalance: string;
  minBalance: string;
  maxBalance: string;
  averageBalance: string;
  change: string;
  changePercent: string;
  totalEntries: number;
  firstEntry: string;
  lastEntry: string;
}