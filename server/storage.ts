import { 
  type Asset, type InsertAsset,
  type Snapshot, type InsertSnapshot,
  type MonthlyStatement, type InsertMonthlyStatement,
  type Wallet, type InsertWallet,
  type PortfolioHistory, type InsertPortfolioHistory,
  type ActivityLog, type InsertActivityLog,
  type MonthlyPortfolioSnapshot, type InsertMonthlyPortfolioSnapshot,
  assets, snapshots, monthlyStatements, wallets, portfolioHistory, activityLogs, monthlyPortfolioSnapshots
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";
import { autoCommit } from "./git-utils";

export interface IStorage {
  getAssets(userId?: string): Promise<Asset[]>;
  getAssetsByMarket(market: string, userId?: string): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | undefined>;
  getAllAssetsIncludingDeleted(userId?: string): Promise<Asset[]>;
  createAsset(asset: InsertAsset): Promise<Asset>;
  updateAsset(id: string, asset: Partial<InsertAsset>): Promise<Asset | undefined>;
  deleteAsset(id: string): Promise<boolean>;
  
  getSnapshots(assetId?: string): Promise<Snapshot[]>;
  getSnapshotsByDateRange(startDate: string, endDate: string): Promise<Snapshot[]>;
  getLatestSnapshots(): Promise<Snapshot[]>;
  createSnapshot(snapshot: InsertSnapshot): Promise<Snapshot>;
  updateSnapshot(id: string, snapshot: Partial<Snapshot>): Promise<Snapshot | undefined>;
  deleteSnapshot(id: string): Promise<boolean>;
  
  getMonthlyStatements(year?: number): Promise<MonthlyStatement[]>;
  getMonthlyStatement(month: number, year: number): Promise<MonthlyStatement | undefined>;
  createOrUpdateMonthlyStatement(statement: InsertMonthlyStatement): Promise<MonthlyStatement>;
  
  getWallets(userId?: string): Promise<Wallet[]>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  deleteWallet(id: string): Promise<boolean>;
  
  getPortfolioHistory(userId?: string): Promise<PortfolioHistory[]>;
  getPortfolioHistoryByMonthYear(userId: string, month: number, year: number): Promise<PortfolioHistory | undefined>;
  createPortfolioHistory(history: InsertPortfolioHistory): Promise<PortfolioHistory>;
  createOrUpdatePortfolioHistory(history: InsertPortfolioHistory): Promise<PortfolioHistory>;
  getPortfolioHistoryBySnapshots(userId?: string): Promise<Array<{date: string; totalValue: number; month: number; year: number}>>;
  getPortfolioHistoryByMonth(userId?: string): Promise<Array<{month: number; year: number; value: number; isLocked: number}>>;

  getMonthlyPortfolioSnapshots(userId: string, year?: number): Promise<MonthlyPortfolioSnapshot[]>;
  getMonthlyPortfolioSnapshot(userId: string, month: number, year: number): Promise<MonthlyPortfolioSnapshot | undefined>;
  createOrUpdateMonthlyPortfolioSnapshot(snapshot: InsertMonthlyPortfolioSnapshot): Promise<MonthlyPortfolioSnapshot>;
  lockMonthlySnapshot(snapshotId: string): Promise<MonthlyPortfolioSnapshot | undefined>;
  unlockMonthlySnapshot(snapshotId: string): Promise<MonthlyPortfolioSnapshot | undefined>;

  getActivities(userId?: string): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
}

export class DatabaseStorage implements IStorage {
  async getAssets(userId?: string): Promise<Asset[]> {
    if (userId) {
      return db.select().from(assets).where(and(eq(assets.userId, userId), eq(assets.isDeleted, 0))).orderBy(assets.symbol);
    }
    return db.select().from(assets).where(eq(assets.isDeleted, 0)).orderBy(assets.symbol);
  }

  async getAssetsByMarket(market: string, userId?: string): Promise<Asset[]> {
    if (userId) {
      return db.select().from(assets).where(and(eq(assets.market, market), eq(assets.userId, userId), eq(assets.isDeleted, 0))).orderBy(assets.symbol);
    }
    return db.select().from(assets).where(and(eq(assets.market, market), eq(assets.isDeleted, 0))).orderBy(assets.symbol);
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id));
    return asset;
  }

  async getAllAssetsIncludingDeleted(userId?: string): Promise<Asset[]> {
    if (userId) {
      return db.select().from(assets).where(eq(assets.userId, userId)).orderBy(assets.symbol);
    }
    return db.select().from(assets).orderBy(assets.symbol);
  }

  async createAsset(asset: InsertAsset): Promise<Asset> {
    console.log(`[SQLite] ========================================`);
    console.log(`[SQLite] INSERTING INTO: 'assets' table`);
    console.log(`[SQLite] User ID:`, asset.userId);
    console.log(`[SQLite] Symbol:`, asset.symbol);
    console.log(`[SQLite] Name:`, asset.name);
    try {
      const [newAsset] = await db.insert(assets).values(asset).returning();
      console.log(`[SQLite] ✓ SUCCESS - Asset ID:`, newAsset.id);
      await autoCommit(`feat: Add asset ${asset.symbol}`);
      console.log(`[SQLite] ========================================`);
      return newAsset;
    } catch (error) {
      console.error(`[SQLite] ✗ ERRO ao inserir asset:`, error);
      throw error;
    }
  }

  async updateAsset(id: string, asset: Partial<InsertAsset>): Promise<Asset | undefined> {
    console.log(`[SQLite] UPDATING asset:`, id);
    try {
      const [updated] = await db.update(assets).set(asset).where(eq(assets.id, id)).returning();
      console.log(`[SQLite] ✓ Asset updated:`, updated.symbol);
      await autoCommit(`feat: Update asset ${updated.symbol}`);
      return updated;
    } catch (error) {
      console.error(`[SQLite] ✗ Error updating asset:`, error);
      throw error;
    }
  }

  async deleteAsset(id: string): Promise<boolean> {
    const result = await db.delete(assets).where(eq(assets.id, id)).returning();
    if (result.length > 0) {
      await autoCommit(`feat: Delete asset`);
    }
    return result.length > 0;
  }

  async getSnapshots(assetId?: string): Promise<Snapshot[]> {
    if (assetId) {
      return db.select().from(snapshots).where(eq(snapshots.assetId, assetId)).orderBy(desc(snapshots.date));
    }
    return db.select().from(snapshots).orderBy(desc(snapshots.date));
  }

  async getSnapshotsByDateRange(startDate: string, endDate: string): Promise<Snapshot[]> {
    return db.select().from(snapshots)
      .where(and(
        gte(snapshots.date, startDate),
        lte(snapshots.date, endDate)
      ))
      .orderBy(desc(snapshots.date));
  }

  async getLatestSnapshots(): Promise<Snapshot[]> {
    const allAssets = await this.getAssets();
    const latestSnapshots: Snapshot[] = [];
    
    for (const asset of allAssets) {
      const [latest] = await db.select().from(snapshots)
        .where(and(eq(snapshots.assetId, asset.id), eq(assets.isDeleted, 0)))
        .orderBy(desc(snapshots.date))
        .limit(1);
      if (latest) {
        latestSnapshots.push(latest);
      }
    }
    
    return latestSnapshots;
  }

  async createSnapshot(snapshot: InsertSnapshot): Promise<Snapshot> {
    console.log(`[SQLite] Creating snapshot for asset ${snapshot.assetId}`);
    try {
      const [newSnapshot] = await db.insert(snapshots).values(snapshot).returning();
      const date = new Date(snapshot.date);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      await this.updateMonthlyStatementFromSnapshots(month, year);
      console.log(`[SQLite] ✓ Snapshot created and saved`);
      await autoCommit(`feat: Add snapshot for ${date.toISOString().split('T')[0]}`);
      return newSnapshot;
    } catch (error) {
      console.error(`[SQLite] ✗ Error creating snapshot:`, error);
      throw error;
    }
  }

  async updateSnapshot(id: string, snapshot: Partial<Snapshot>): Promise<Snapshot | undefined> {
    try {
      const [updated] = await db.update(snapshots).set(snapshot).where(eq(snapshots.id, id)).returning();
      console.log(`[SQLite] ✓ Snapshot updated: ${id}`);
      await autoCommit(`feat: Update snapshot`);
      return updated;
    } catch (error) {
      console.error(`[SQLite] ✗ Error updating snapshot:`, error);
      throw error;
    }
  }

  async deleteSnapshot(id: string): Promise<boolean> {
    const [snapshot] = await db.select().from(snapshots).where(eq(snapshots.id, id));
    if (!snapshot) return false;
    
    const result = await db.delete(snapshots).where(eq(snapshots.id, id)).returning();
    
    if (result.length > 0) {
      const date = new Date(snapshot.date);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      await this.updateMonthlyStatementFromSnapshots(month, year);
    }
    
    return result.length > 0;
  }

  async getMonthlyStatements(year?: number): Promise<MonthlyStatement[]> {
    if (year) {
      return db.select().from(monthlyStatements)
        .where(eq(monthlyStatements.year, year))
        .orderBy(desc(monthlyStatements.month));
    }
    return db.select().from(monthlyStatements)
      .orderBy(desc(monthlyStatements.year), desc(monthlyStatements.month));
  }

  async getMonthlyStatement(month: number, year: number): Promise<MonthlyStatement | undefined> {
    const [statement] = await db.select().from(monthlyStatements)
      .where(and(
        eq(monthlyStatements.month, month),
        eq(monthlyStatements.year, year)
      ));
    return statement;
  }

  async createOrUpdateMonthlyStatement(statement: InsertMonthlyStatement): Promise<MonthlyStatement> {
    const existing = await this.getMonthlyStatement(statement.month, statement.year);
    
    if (existing) {
      const [updated] = await db.update(monthlyStatements)
        .set({ 
          ...statement, 
          updatedAt: new Date() 
        })
        .where(eq(monthlyStatements.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(monthlyStatements).values(statement).returning();
    return created;
  }

  private async updateMonthlyStatementFromSnapshots(month: number, year: number): Promise<void> {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];
    
    const monthSnapshots = await this.getSnapshotsByDateRange(startDate, endDate);
    
    let startValue = 0;
    let endValue = 0;
    
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevStatement = await this.getMonthlyStatement(prevMonth, prevYear);
    if (prevStatement) {
      startValue = prevStatement.endValue;
    }
    
    const allAssets = await this.getAssets();
    for (const asset of allAssets) {
      const assetSnapshots = monthSnapshots.filter(s => s.assetId === asset.id);
      if (assetSnapshots.length > 0) {
        const sorted = assetSnapshots.sort((a, b) => 
          new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        endValue += sorted[0].value;
      } else {
        const [latest] = await db.select().from(snapshots)
          .where(and(
            eq(snapshots.assetId, asset.id),
            lte(snapshots.date, endDate)
          ))
          .orderBy(desc(snapshots.date))
          .limit(1);
        if (latest) {
          endValue += latest.value;
        }
      }
    }
    
    await this.createOrUpdateMonthlyStatement({
      month,
      year,
      startValue,
      endValue
    });
  }

  async getWallets(userId?: string): Promise<Wallet[]> {
    if (userId) {
      return db.select().from(wallets).where(eq(wallets.userId, userId)).orderBy(wallets.name);
    }
    return db.select().from(wallets).orderBy(wallets.name);
  }

  async createWallet(wallet: InsertWallet): Promise<Wallet> {
    console.log(`[SQLite] Adding wallet:`, wallet.name);
    try {
      const [newWallet] = await db.insert(wallets).values(wallet).returning();
      console.log(`[SQLite] ✓ Wallet created`);
      await autoCommit(`feat: Add wallet ${wallet.name}`);
      return newWallet;
    } catch (error) {
      console.error(`[SQLite] ✗ Error creating wallet:`, error);
      throw error;
    }
  }

  async deleteWallet(id: string): Promise<boolean> {
    const result = await db.delete(wallets).where(eq(wallets.id, id)).returning();
    return result.length > 0;
  }

  async getPortfolioHistory(userId?: string): Promise<PortfolioHistory[]> {
    if (userId) {
      return db.select().from(portfolioHistory).where(eq(portfolioHistory.userId, userId)).orderBy(desc(portfolioHistory.date));
    }
    return db.select().from(portfolioHistory).orderBy(desc(portfolioHistory.date));
  }

  async createPortfolioHistory(history: InsertPortfolioHistory): Promise<PortfolioHistory> {
    const [newHistory] = await db.insert(portfolioHistory).values(history).returning();
    return newHistory;
  }

  async getPortfolioHistoryByMonthYear(userId: string, month: number, year: number): Promise<PortfolioHistory | undefined> {
    const [record] = await db.select().from(portfolioHistory)
      .where(and(
        eq(portfolioHistory.userId, userId),
        eq(portfolioHistory.month, month),
        eq(portfolioHistory.year, year)
      ));
    return record;
  }

  async createOrUpdatePortfolioHistory(history: InsertPortfolioHistory): Promise<PortfolioHistory> {
    if (!history.userId) {
      throw new Error("userId is required for portfolio history");
    }
    
    const existing = await this.getPortfolioHistoryByMonthYear(history.userId, history.month, history.year);
    
    if (existing) {
      const [updated] = await db.update(portfolioHistory)
        .set(history)
        .where(eq(portfolioHistory.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(portfolioHistory).values(history).returning();
    return created;
  }

  async getMonthlyPortfolioSnapshots(userId: string, year?: number): Promise<MonthlyPortfolioSnapshot[]> {
    if (year) {
      return db.select().from(monthlyPortfolioSnapshots)
        .where(and(
          eq(monthlyPortfolioSnapshots.userId, userId),
          eq(monthlyPortfolioSnapshots.year, year)
        ))
        .orderBy(monthlyPortfolioSnapshots.month);
    }
    return db.select().from(monthlyPortfolioSnapshots)
      .where(eq(monthlyPortfolioSnapshots.userId, userId))
      .orderBy(desc(monthlyPortfolioSnapshots.year), monthlyPortfolioSnapshots.month);
  }

  async getMonthlyPortfolioSnapshot(userId: string, month: number, year: number): Promise<MonthlyPortfolioSnapshot | undefined> {
    const [snapshot] = await db.select().from(monthlyPortfolioSnapshots)
      .where(and(
        eq(monthlyPortfolioSnapshots.userId, userId || ""),
        eq(monthlyPortfolioSnapshots.month, month),
        eq(monthlyPortfolioSnapshots.year, year)
      ));
    return snapshot;
  }

  async createOrUpdateMonthlyPortfolioSnapshot(snapshot: InsertMonthlyPortfolioSnapshot): Promise<MonthlyPortfolioSnapshot> {
    const userId = snapshot.userId || "default-user";
    const existing = await this.getMonthlyPortfolioSnapshot(userId, snapshot.month, snapshot.year);
    
    if (existing) {
      const [updated] = await db.update(monthlyPortfolioSnapshots)
        .set({ 
          ...snapshot, 
          updatedAt: new Date() 
        })
        .where(eq(monthlyPortfolioSnapshots.id, existing.id))
        .returning();
      return updated;
    }
    
    const [created] = await db.insert(monthlyPortfolioSnapshots).values(snapshot).returning();
    return created;
  }

  async lockMonthlySnapshot(snapshotId: string): Promise<MonthlyPortfolioSnapshot | undefined> {
    const [updated] = await db.update(monthlyPortfolioSnapshots)
      .set({ isLocked: 1, updatedAt: new Date() })
      .where(eq(monthlyPortfolioSnapshots.id, snapshotId))
      .returning();
    return updated;
  }

  async unlockMonthlySnapshot(snapshotId: string): Promise<MonthlyPortfolioSnapshot | undefined> {
    const [updated] = await db.update(monthlyPortfolioSnapshots)
      .set({ isLocked: 0, updatedAt: new Date() })
      .where(eq(monthlyPortfolioSnapshots.id, snapshotId))
      .returning();
    return updated;
  }

  async getActivities(userId?: string): Promise<ActivityLog[]> {
    if (userId) {
      return db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.createdAt));
    }
    return db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db.insert(activityLogs).values(log).returning();
    console.log(`[SQLite] Activity logged: ${log.action}`);
    await autoCommit(`feat: Log activity - ${log.action}`);
    return newLog;
  }

  async getPortfolioHistoryBySnapshots(userId?: string): Promise<Array<{date: string; totalValue: number; month: number; year: number}>> {
    // Get user's assets first
    const userAssets = await this.getAssets(userId);
    const assetIds = new Set(userAssets.map(a => a.id));
    
    // Get all snapshots, then filter by user's assets
    const allSnapshots = await this.getSnapshots();
    const userSnapshots = allSnapshots.filter(s => assetIds.has(s.assetId));
    
    if (userSnapshots.length === 0) return [];
    
    // Group snapshots by asset
    const snapshotsByAsset: Record<string, Snapshot[]> = {};
    userSnapshots.forEach(snapshot => {
      if (!snapshotsByAsset[snapshot.assetId]) {
        snapshotsByAsset[snapshot.assetId] = [];
      }
      snapshotsByAsset[snapshot.assetId].push(snapshot);
    });
    
    // Sort snapshots by date for each asset
    Object.keys(snapshotsByAsset).forEach(assetId => {
      snapshotsByAsset[assetId].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    
    // Generate 48 months of history starting from November 2025
    const startDate = new Date(2025, 10, 1); // November 2025 (month is 0-indexed)
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 47); // Add 47 months to get 48 total
    const lastDayOfEndMonth = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0); // Last day of final month
    
    const portfolioHistory: Array<{date: string; totalValue: number; month: number; year: number}> = [];
    
    // Generate entry for each month
    let currentDate = new Date(startDate);
    while (currentDate <= lastDayOfEndMonth) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;
      const lastDayOfMonth = new Date(year, month, 0); // Last day of current month
      
      let totalValue = 0;
      
      // For each asset, find the latest snapshot up to end of this month
      Object.keys(snapshotsByAsset).forEach(assetId => {
        const assetSnapshots = snapshotsByAsset[assetId];
        for (let i = assetSnapshots.length - 1; i >= 0; i--) {
          if (new Date(assetSnapshots[i].date) <= lastDayOfMonth) {
            totalValue += assetSnapshots[i].value;
            break;
          }
        }
      });
      
      // Always add entry for each month, even if value is 0
      const dateStr = lastDayOfMonth.toISOString().split('T')[0];
      portfolioHistory.push({
        date: dateStr,
        totalValue,
        month,
        year
      });
      
      currentDate.setMonth(currentDate.getMonth() + 1);
    }
    
    return portfolioHistory;
  }

  async getPortfolioHistoryByMonth(userId?: string): Promise<Array<{month: number; year: number; value: number; isLocked: number}>> {
    // Get user's assets first
    const userAssets = await this.getAssets(userId);
    const assetIds = new Set(userAssets.map(a => a.id));
    
    // Get all snapshots, then filter by user's assets
    const allSnapshots = await this.getSnapshots();
    const userSnapshots = allSnapshots.filter(s => assetIds.has(s.assetId));
    
    // Group snapshots by asset ID
    const snapshotsByAsset: Record<string, Snapshot[]> = {};
    userSnapshots.forEach(snapshot => {
      if (!snapshotsByAsset[snapshot.assetId]) {
        snapshotsByAsset[snapshot.assetId] = [];
      }
      snapshotsByAsset[snapshot.assetId].push(snapshot);
    });
    
    // Sort snapshots by date for each asset
    Object.keys(snapshotsByAsset).forEach(assetId => {
      snapshotsByAsset[assetId].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    });
    
    // Get all unique months from user's snapshots
    const monthsSet = new Set<string>();
    userSnapshots.forEach(snapshot => {
      const date = new Date(snapshot.date);
      const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
      monthsSet.add(key);
    });
    
    // For each month, sum the latest snapshot value of each asset
    const byMonth: Record<string, {month: number; year: number; value: number; isLocked: number}> = {};
    
    monthsSet.forEach(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const endOfMonth = new Date(year, month, 0); // Last day of month
      
      let totalValue = 0;
      let isLocked = 0;
      
      // For each asset, find the latest snapshot up to end of this month
      Object.keys(snapshotsByAsset).forEach(assetId => {
        const assetSnapshots = snapshotsByAsset[assetId];
        // Find latest snapshot where date <= end of month, working backwards
        for (let i = assetSnapshots.length - 1; i >= 0; i--) {
          if (new Date(assetSnapshots[i].date) <= endOfMonth) {
            totalValue += assetSnapshots[i].value;
            // Check if ANY snapshot in this month is locked
            if (assetSnapshots[i].isLocked) {
              isLocked = 1;
            }
            break;
          }
        }
      });
      
      byMonth[monthKey] = { month, year, value: totalValue, isLocked };
    });
    
    return Object.values(byMonth).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }
}

export const storage = new DatabaseStorage();
