import { 
  type Asset, type InsertAsset,
  type Snapshot, type InsertSnapshot,
  type MonthlyStatement, type InsertMonthlyStatement,
  type Wallet, type InsertWallet,
  type PortfolioHistory, type InsertPortfolioHistory,
  type ActivityLog, type InsertActivityLog,
  assets, snapshots, monthlyStatements, wallets, portfolioHistory, activityLogs
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

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
  deleteSnapshot(id: string): Promise<boolean>;
  
  getMonthlyStatements(year?: number): Promise<MonthlyStatement[]>;
  getMonthlyStatement(month: number, year: number): Promise<MonthlyStatement | undefined>;
  createOrUpdateMonthlyStatement(statement: InsertMonthlyStatement): Promise<MonthlyStatement>;
  
  getWallets(userId?: string): Promise<Wallet[]>;
  createWallet(wallet: InsertWallet): Promise<Wallet>;
  deleteWallet(id: string): Promise<boolean>;
  
  getPortfolioHistory(userId?: string): Promise<PortfolioHistory[]>;
  createPortfolioHistory(history: InsertPortfolioHistory): Promise<PortfolioHistory>;
  getPortfolioHistoryBySnapshots(userId?: string): Promise<Array<{date: string; totalValue: number; month: number; year: number}>>;
  getPortfolioHistoryByMonth(userId?: string): Promise<Array<{month: number; year: number; value: number}>>;

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
    const [newAsset] = await db.insert(assets).values(asset).returning();
    return newAsset;
  }

  async updateAsset(id: string, asset: Partial<InsertAsset>): Promise<Asset | undefined> {
    const [updated] = await db.update(assets).set(asset).where(eq(assets.id, id)).returning();
    return updated;
  }

  async deleteAsset(id: string): Promise<boolean> {
    const result = await db.delete(assets).where(eq(assets.id, id)).returning();
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
    const [newSnapshot] = await db.insert(snapshots).values(snapshot).returning();
    
    const date = new Date(snapshot.date);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    await this.updateMonthlyStatementFromSnapshots(month, year);
    
    return newSnapshot;
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
    const [newWallet] = await db.insert(wallets).values(wallet).returning();
    return newWallet;
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

  async getActivities(userId?: string): Promise<ActivityLog[]> {
    if (userId) {
      return db.select().from(activityLogs).where(eq(activityLogs.userId, userId)).orderBy(desc(activityLogs.createdAt));
    }
    return db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [newLog] = await db.insert(activityLogs).values(log).returning();
    return newLog;
  }

  async getPortfolioHistoryBySnapshots(userId?: string): Promise<Array<{date: string; totalValue: number; month: number; year: number}>> {
    // Get user's assets first
    const userAssets = await this.getAssets(userId);
    const assetIds = new Set(userAssets.map(a => a.id));
    
    // Get all snapshots, then filter by user's assets
    const allSnapshots = await this.getSnapshots();
    const userSnapshots = allSnapshots.filter(s => assetIds.has(s.assetId));
    
    // Group snapshots by date
    const snapshotsByDate: Record<string, Snapshot[]> = {};
    userSnapshots.forEach(snapshot => {
      if (!snapshotsByDate[snapshot.date]) {
        snapshotsByDate[snapshot.date] = [];
      }
      snapshotsByDate[snapshot.date].push(snapshot);
    });
    
    // Calculate portfolio value for each date
    const portfolioHistory: Array<{date: string; totalValue: number; month: number; year: number}> = [];
    
    Object.entries(snapshotsByDate).forEach(([date, dateSnapshots]) => {
      let totalValue = 0;
      dateSnapshots.forEach(snapshot => {
        totalValue += snapshot.value;
      });
      
      const dateObj = new Date(date);
      portfolioHistory.push({
        date,
        totalValue,
        month: dateObj.getMonth() + 1,
        year: dateObj.getFullYear()
      });
    });
    
    // Sort by date
    return portfolioHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async getPortfolioHistoryByMonth(userId?: string): Promise<Array<{month: number; year: number; value: number}>> {
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
    const byMonth: Record<string, {month: number; year: number; value: number}> = {};
    
    monthsSet.forEach(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const endOfMonth = new Date(year, month, 0); // Last day of month
      
      let totalValue = 0;
      
      // For each asset, find the latest snapshot up to end of this month
      Object.keys(snapshotsByAsset).forEach(assetId => {
        const assetSnapshots = snapshotsByAsset[assetId];
        // Find latest snapshot where date <= end of month, working backwards
        for (let i = assetSnapshots.length - 1; i >= 0; i--) {
          if (new Date(assetSnapshots[i].date) <= endOfMonth) {
            totalValue += assetSnapshots[i].value;
            break;
          }
        }
      });
      
      byMonth[monthKey] = { month, year, value: totalValue };
    });
    
    return Object.values(byMonth).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });
  }
}

export const storage = new DatabaseStorage();
