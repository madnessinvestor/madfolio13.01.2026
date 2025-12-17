import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAssetSchema, insertSnapshotSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "./replit_integrations/auth";
import { fetchAssetPrice, updateAssetPrice, startPriceUpdater } from "./services/pricing";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  startPriceUpdater(5 * 60 * 1000);

  app.get("/api/assets", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const market = req.query.market as string | undefined;
      const assets = market 
        ? await storage.getAssetsByMarket(market, userId)
        : await storage.getAssets(userId);
      res.json(assets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assets" });
    }
  });

  app.get("/api/assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch asset" });
    }
  });

  app.post("/api/assets", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const validated = insertAssetSchema.parse(req.body);
      const asset = await storage.createAsset({ ...validated, userId });
      
      const price = await fetchAssetPrice(asset.symbol, asset.market);
      if (price !== null) {
        await storage.updateAsset(asset.id, { currentPrice: price, lastPriceUpdate: new Date() });
      }
      
      const updatedAsset = await storage.getAsset(asset.id);
      res.status(201).json(updatedAsset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating asset:", error);
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  app.patch("/api/assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const validated = insertAssetSchema.partial().parse(req.body);
      const asset = await storage.updateAsset(req.params.id, validated);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }
      res.json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  app.delete("/api/assets/:id", isAuthenticated, async (req: any, res) => {
    try {
      const deleted = await storage.deleteAsset(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Asset not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  app.post("/api/assets/:id/refresh-price", isAuthenticated, async (req: any, res) => {
    try {
      const price = await updateAssetPrice(req.params.id);
      if (price === null) {
        return res.status(404).json({ error: "Could not fetch price" });
      }
      const asset = await storage.getAsset(req.params.id);
      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh price" });
    }
  });

  app.get("/api/snapshots", isAuthenticated, async (req: any, res) => {
    try {
      const assetId = req.query.assetId as string | undefined;
      const snapshots = await storage.getSnapshots(assetId);
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch snapshots" });
    }
  });

  app.get("/api/snapshots/latest", isAuthenticated, async (req: any, res) => {
    try {
      const snapshots = await storage.getLatestSnapshots();
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest snapshots" });
    }
  });

  app.get("/api/snapshots/range", isAuthenticated, async (req: any, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ error: "startDate and endDate are required" });
      }
      
      const snapshots = await storage.getSnapshotsByDateRange(startDate, endDate);
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch snapshots" });
    }
  });

  app.post("/api/snapshots", isAuthenticated, async (req: any, res) => {
    try {
      const validated = insertSnapshotSchema.parse(req.body);
      const snapshot = await storage.createSnapshot(validated);
      res.status(201).json(snapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating snapshot:", error);
      res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  app.delete("/api/snapshots/:id", isAuthenticated, async (req: any, res) => {
    try {
      const deleted = await storage.deleteSnapshot(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Snapshot not found" });
      }
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete snapshot" });
    }
  });

  app.get("/api/statements", isAuthenticated, async (req: any, res) => {
    try {
      const year = req.query.year ? parseInt(req.query.year as string) : undefined;
      const statements = await storage.getMonthlyStatements(year);
      res.json(statements);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statements" });
    }
  });

  app.get("/api/statements/:year/:month", isAuthenticated, async (req: any, res) => {
    try {
      const month = parseInt(req.params.month);
      const year = parseInt(req.params.year);
      const statement = await storage.getMonthlyStatement(month, year);
      
      if (!statement) {
        return res.status(404).json({ error: "Statement not found" });
      }
      
      const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];
      const snapshots = await storage.getSnapshotsByDateRange(startDate, endDate);
      
      const assets = await storage.getAssets();
      const transactions = await Promise.all(snapshots.map(async (s) => {
        const asset = assets.find(a => a.id === s.assetId);
        return {
          date: s.date,
          assetSymbol: asset?.symbol || "Unknown",
          value: s.value,
          type: "snapshot" as const
        };
      }));
      
      res.json({
        ...statement,
        transactions
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statement" });
    }
  });

  app.get("/api/portfolio/summary", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const assets = await storage.getAssets();
      const latestSnapshots = await storage.getLatestSnapshots();
      
      let totalValue = 0;
      let cryptoValue = 0;
      let traditionalValue = 0;
      
      const holdings = await Promise.all(latestSnapshots.map(async (snapshot) => {
        const asset = assets.find(a => a.id === snapshot.assetId);
        if (!asset) return null;
        
        const value = snapshot.value;
        totalValue += value;
        
        if (asset.market === "crypto") {
          cryptoValue += value;
        } else {
          traditionalValue += value;
        }
        
        return {
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          category: asset.category,
          market: asset.market,
          value,
          amount: snapshot.amount,
          unitPrice: snapshot.unitPrice,
          lastUpdate: snapshot.date
        };
      }));
      
      res.json({
        totalValue,
        cryptoValue,
        traditionalValue,
        cryptoExposure: totalValue > 0 ? (cryptoValue / totalValue) * 100 : 0,
        holdings: holdings.filter(Boolean)
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio summary" });
    }
  });

  app.get("/api/portfolio/history", isAuthenticated, async (req: any, res) => {
    try {
      const statements = await storage.getMonthlyStatements();
      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      
      const history = statements
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        })
        .map(s => ({
          month: `${monthNames[s.month - 1]}`,
          year: s.year,
          value: s.endValue,
          variation: s.startValue > 0 ? ((s.endValue - s.startValue) / s.startValue) * 100 : 0
        }));
      
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio history" });
    }
  });

  return httpServer;
}
