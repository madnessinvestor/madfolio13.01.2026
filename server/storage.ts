import { 
  type Asset, type InsertAsset,
  type Snapshot, type InsertSnapshot,
  type MonthlyStatement, type InsertMonthlyStatement,
  assets, snapshots, monthlyStatements
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lte } from "drizzle-orm";

export interface IStorage {
  getAssets(userId?: string): Promise<Asset[]>;
  getAssetsByMarket(market: string, userId?: string): Promise<Asset[]>;
  getAsset(id: string): Promise<Asset | undefined>;
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
}

export class DatabaseStorage implements IStorage {
  async getAssets(userId?: string): Promise<Asset[]> {
    if (userId) {
      return db.select().from(assets).where(eq(assets.userId, userId)).orderBy(assets.symbol);
    }
    return db.select().from(assets).orderBy(assets.symbol);
  }

  async getAssetsByMarket(market: string, userId?: string): Promise<Asset[]> {
    if (userId) {
      return db.select().from(assets).where(and(eq(assets.market, market), eq(assets.userId, userId))).orderBy(assets.symbol);
    }
    return db.select().from(assets).where(eq(assets.market, market)).orderBy(assets.symbol);
  }

  async getAsset(id: string): Promise<Asset | undefined> {
    const [asset] = await db.select().from(assets).where(eq(assets.id, id));
    return asset;
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
        .where(eq(snapshots.assetId, asset.id))
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
}

export const storage = new DatabaseStorage();
