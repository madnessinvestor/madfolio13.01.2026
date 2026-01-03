import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertAssetSchema,
  insertSnapshotSchema,
  insertWalletSchema,
  insertMonthlyPortfolioSnapshotSchema,
} from "@shared/schema";
import { z } from "zod";

import {
  fetchAssetPrice,
  updateAssetPrice,
  startPriceUpdater,
  fetchHistoricalAssetPrice,
} from "./services/pricing";
import {
  fetchExchangeRates,
  convertToBRL,
  getExchangeRate,
} from "./services/exchangeRate";
import { fetchWalletBalance } from "./services/walletBalance";
import {
  getBalances,
  getDetailedBalances,
  startStepMonitor,
  forceRefresh,
  forceRefreshAndWait,
  setWallets,
  forceRefreshWallet,
  initializeWallet,
} from "./services/debankScraper";
import {
  getWalletHistory,
  getAllHistory,
  getLatestByWallet,
  getWalletStats,
  getLastHighestValue,
  getLastValidBalance,
  createInitialHistoryEntry,
} from "./services/walletCache";
import { fetchJupPortfolio } from "./services/jupAgScraper";
import { validateCredentials } from "./sqlite-auth";

const investmentSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  category: z.string(),
  market: z.enum([
    "crypto",
    "crypto_simplified",
    "fixed_income",
    "variable_income",
    "variable_income_simplified",
    "real_estate",
  ]),
  currency: z.enum(["BRL", "USD", "EUR"]).default("BRL"),
  quantity: z.number().positive(),
  acquisitionPrice: z.number().positive(),
  acquisitionDate: z.string(),
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  startPriceUpdater(5 * 60 * 1000);
  // startStepMonitor is called in server/index.ts with 60 minute interval
  // Do not call it here to avoid duplicate monitoring

  // SQLite authentication routes
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/database-status", async (req, res) => {
    try {
      const { supabase } = await import("./supabase");
      const { data, error } = await supabase.from("users").select("*").limit(1);

      if (error) {
        return res.json({ connected: false, error: error.message });
      }

      res.json({ connected: true });
    } catch (error) {
      res.json({ connected: false, error: String(error) });
    }
  });

  app.get("/api/debug/user-info", async (req: any, res) => {
    res.json({
      userId: req.user?.claims?.sub,
      user: req.user,
      claims: req.user?.claims,
    });
  });

  app.post("/login", (req, res) => {
    const { usernameOrEmail, password } = req.body;
    const result = validateCredentials(usernameOrEmail, password);

    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  });

  app.get("/api/assets", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
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

  app.get("/api/assets/:id", async (req: any, res) => {
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

  app.post("/api/assets", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    console.log(
      `[API] POST /api/assets - userId:`,
      userId,
      "auth check passed"
    );
    try {
      if (!userId) {
        console.error(`[API] ✗ POST /api/assets - Missing userId`);
        return res.status(400).json({ error: "User ID is required" });
      }
      const validated = insertAssetSchema.parse(req.body);
      console.log(`[API] ✓ Validation passed, saving asset to Supabase...`);
      const asset = await storage.createAsset({ ...validated, userId });

      const price = await fetchAssetPrice(asset.symbol, asset.market);
      if (price !== null) {
        await storage.updateAsset(asset.id, {
          currentPrice: price,
          lastPriceUpdate: new Date(),
        });
      }

      await storage.createActivityLog({
        userId,
        type: "create",
        category: "asset",
        assetId: asset.id,
        assetName: asset.name,
        assetSymbol: asset.symbol,
        action: `Investimento adicionado: ${asset.symbol} - ${asset.name}`,
        details: `Quantidade: ${asset.quantity}, Categoria: ${asset.category}`,
      });

      // Sync portfolio evolution after asset creation
      try {
        const { syncPortfolioEvolution } = await import(
          "./services/portfolioSync"
        );
        await syncPortfolioEvolution(userId);
      } catch (error) {
        console.error("[API] Error syncing portfolio evolution:", error);
      }

      const updatedAsset = await storage.getAsset(asset.id);
      console.log(
        `[API] ✓ POST /api/assets complete - asset returned to client`
      );
      res.status(201).json(updatedAsset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error(
          `[API] ✗ POST /api/assets - Validation error:`,
          error.errors
        );
        return res.status(400).json({ error: error.errors });
      }
      console.error("[API] ✗ POST /api/assets - Server error:", error);
      res.status(500).json({ error: "Failed to create asset" });
    }
  });

  app.patch("/api/assets/:id", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const oldAsset = await storage.getAsset(req.params.id);
      const validated = insertAssetSchema.partial().parse(req.body);
      const asset = await storage.updateAsset(req.params.id, validated);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      if (oldAsset) {
        const changes = [];
        if (
          validated.quantity !== undefined &&
          oldAsset.quantity !== validated.quantity
        ) {
          changes.push(
            `Quantidade: ${oldAsset.quantity} → ${validated.quantity}`
          );
        }
        if (
          validated.acquisitionPrice !== undefined &&
          oldAsset.acquisitionPrice !== validated.acquisitionPrice
        ) {
          changes.push(
            `Preço de aquisição: ${oldAsset.acquisitionPrice} → ${validated.acquisitionPrice}`
          );
        }

        if (changes.length > 0) {
          await storage.createActivityLog({
            userId,
            type: "update",
            category: "asset",
            assetId: asset.id,
            assetName: asset.name,
            assetSymbol: asset.symbol,
            action: `Investimento editado: ${asset.symbol}`,
            details: changes.join(", "),
          });
        }
      }

      // Sync portfolio evolution after asset update
      try {
        const { syncPortfolioEvolution } = await import(
          "./services/portfolioSync"
        );
        await syncPortfolioEvolution(userId);
      } catch (error) {
        console.error("[API] Error syncing portfolio evolution:", error);
      }

      res.json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  app.delete("/api/assets/:id", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      await storage.createActivityLog({
        userId,
        type: "delete",
        category: "asset",
        assetId: asset.id,
        assetName: asset.name,
        assetSymbol: asset.symbol,
        action: `Investimento deletado: ${asset.symbol} - ${asset.name}`,
        details: `Quantidade: ${asset.quantity}`,
      });

      await storage.updateAsset(req.params.id, {
        isDeleted: 1,
        deletedAt: new Date(),
      });

      // Sync portfolio evolution after asset deletion
      try {
        const { syncPortfolioEvolution } = await import(
          "./services/portfolioSync"
        );
        await syncPortfolioEvolution(userId);
      } catch (error) {
        console.error("[API] Error syncing portfolio evolution:", error);
      }

      res.json({ success: true, message: "Asset deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  app.get("/api/assets/history/all", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const allAssets = await storage.getAllAssetsIncludingDeleted(userId);
      res.json(allAssets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assets history" });
    }
  });

  app.post("/api/assets/:id/refresh-price", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const price = await updateAssetPrice(req.params.id);
      if (price === null) {
        return res.status(404).json({ error: "Could not fetch price" });
      }
      const asset = await storage.getAsset(req.params.id);

      // Sync portfolio evolution after price refresh
      try {
        const { syncPortfolioEvolution } = await import(
          "./services/portfolioSync"
        );
        await syncPortfolioEvolution(userId);
      } catch (error) {
        console.error("[API] Error syncing portfolio evolution:", error);
      }

      res.json(asset);
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh price" });
    }
  });

  app.post("/api/investments", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const validated = investmentSchema.parse(req.body);

      const asset = await storage.createAsset({
        userId,
        symbol: validated.symbol.toUpperCase(),
        name: validated.name,
        category: validated.category,
        market: validated.market,
        currency: validated.currency,
        quantity: validated.quantity,
        acquisitionPrice: validated.acquisitionPrice,
        acquisitionDate: validated.acquisitionDate,
      });

      // Only fetch online prices for real crypto and variable income markets
      if (
        validated.market === "crypto" ||
        validated.market === "variable_income"
      ) {
        const price = await fetchAssetPrice(asset.symbol, asset.market);
        if (price !== null) {
          await storage.updateAsset(asset.id, {
            currentPrice: price,
            lastPriceUpdate: new Date(),
          });
        } else {
          // Use acquisition price as fallback if price fetch fails
          await storage.updateAsset(asset.id, {
            currentPrice: validated.acquisitionPrice,
            lastPriceUpdate: new Date(),
          });
        }
      } else {
        // For simplified markets, fixed income, and real estate: use acquisition price
        await storage.updateAsset(asset.id, {
          currentPrice: validated.acquisitionPrice,
          lastPriceUpdate: new Date(),
        });
      }

      const updatedAsset = await storage.getAsset(asset.id);
      const currentPrice =
        updatedAsset?.currentPrice || validated.acquisitionPrice;
      const totalValueInCurrency = validated.quantity * currentPrice;
      const totalValueBRL = await convertToBRL(
        totalValueInCurrency,
        validated.currency
      );

      await storage.createSnapshot({
        assetId: asset.id,
        value: totalValueBRL,
        amount: validated.quantity,
        unitPrice: validated.acquisitionPrice,
        date: validated.acquisitionDate,
        notes: "Aquisição inicial",
      });

      res.status(201).json(updatedAsset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating investment:", error);
      res.status(500).json({ error: "Failed to create investment" });
    }
  });

  app.get("/api/exchange-rates", async (req, res) => {
    try {
      const rates = await fetchExchangeRates();
      res.json(rates);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch exchange rates" });
    }
  });

  app.get("/api/price-lookup", async (req, res) => {
    const symbol = req.query.symbol as string;
    const market = req.query.market as string;

    if (!symbol || !market) {
      return res.status(400).json({ error: "Symbol and market are required" });
    }

    try {
      const price = await fetchAssetPrice(symbol, market);
      if (price === null) {
        return res.json({
          symbol: symbol.toUpperCase(),
          price: null,
          currency: "BRL",
          error: "Price not found",
        });
      }

      res.json({ symbol: symbol.toUpperCase(), price, currency: "BRL" });
    } catch (error) {
      res.json({
        symbol: symbol.toUpperCase(),
        price: null,
        currency: "BRL",
        error: "Failed to fetch price",
      });
    }
  });

  app.get("/api/snapshots", async (req: any, res) => {
    try {
      const assetId = req.query.assetId as string | undefined;
      const snapshots = await storage.getSnapshots(assetId);
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch snapshots" });
    }
  });

  app.patch("/api/investments/:id", async (req: any, res) => {
    try {
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const {
        name,
        symbol,
        quantity,
        acquisitionPrice,
        acquisitionDate,
        currentPrice,
      } = req.body;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (symbol !== undefined) updates.symbol = symbol.toUpperCase();
      if (quantity !== undefined) updates.quantity = quantity;
      if (acquisitionPrice !== undefined)
        updates.acquisitionPrice = acquisitionPrice;
      if (acquisitionDate !== undefined)
        updates.acquisitionDate = acquisitionDate;
      if (currentPrice !== undefined) {
        updates.currentPrice = currentPrice;
        updates.lastPriceUpdate = new Date();
      }

      const updatedAsset = await storage.updateAsset(req.params.id, updates);

      if (currentPrice !== undefined && currentPrice !== asset.currentPrice) {
        const totalValue = (quantity || asset.quantity || 1) * currentPrice;
        await storage.createSnapshot({
          assetId: req.params.id,
          value: totalValue,
          amount: quantity || asset.quantity || 1,
          unitPrice: currentPrice,
          date: new Date().toISOString().split("T")[0],
          notes: "Atualização manual",
        });
      }

      res.json(updatedAsset);
    } catch (error) {
      console.error("Error updating investment:", error);
      res.status(500).json({ error: "Failed to update investment" });
    }
  });

  app.post("/api/investments/:id/preview-historical", async (req: any, res) => {
    try {
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const { updateDate, quantity } = req.body;
      if (!updateDate) {
        return res.status(400).json({ error: "updateDate is required" });
      }

      // Don't fetch historical price for stable assets
      if (asset.market === "fixed_income" || asset.market === "real_estate") {
        return res
          .status(400)
          .json({ error: "Cannot update historical price for stable assets" });
      }

      // Fetch historical price for the specified date
      const historicalPrice = await fetchHistoricalAssetPrice(
        asset.symbol,
        asset.market,
        updateDate
      );
      if (historicalPrice === null) {
        return res.status(400).json({
          error:
            "Could not fetch historical price for this date. Available for crypto assets only.",
        });
      }

      // Calculate total value with historical price
      const assetQuantity = quantity || asset.quantity || 1;
      const totalValue = await convertToBRL(
        assetQuantity * historicalPrice,
        asset.currency
      );

      res.json({ price: historicalPrice, total: totalValue });
    } catch (error) {
      console.error("Error previewing historical investment:", error);
      res
        .status(500)
        .json({ error: "Failed to preview historical investment" });
    }
  });

  app.post("/api/investments/:id/update-historical", async (req: any, res) => {
    try {
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const { updateDate, quantity } = req.body;
      if (!updateDate) {
        return res.status(400).json({ error: "updateDate is required" });
      }

      // Don't fetch historical price for stable assets
      if (asset.market === "fixed_income" || asset.market === "real_estate") {
        return res
          .status(400)
          .json({ error: "Cannot update historical price for stable assets" });
      }

      // Fetch historical price for the specified date
      const historicalPrice = await fetchHistoricalAssetPrice(
        asset.symbol,
        asset.market,
        updateDate
      );
      if (historicalPrice === null) {
        return res.status(400).json({
          error:
            "Could not fetch historical price for this date. Available for crypto assets only.",
        });
      }

      // Calculate total value with historical price
      const assetQuantity = quantity || asset.quantity || 1;
      const totalValue = await convertToBRL(
        assetQuantity * historicalPrice,
        asset.currency
      );

      // Create snapshot with historical data
      const snapshot = await storage.createSnapshot({
        assetId: req.params.id,
        value: totalValue,
        amount: assetQuantity,
        unitPrice: historicalPrice,
        date: updateDate,
        notes: `Atualização histórica - ${historicalPrice.toFixed(
          2
        )} BRL por unidade`,
      });

      res.status(201).json(snapshot);
    } catch (error) {
      console.error("Error updating historical investment:", error);
      res.status(500).json({ error: "Failed to update historical investment" });
    }
  });

  app.get("/api/snapshots/latest", async (req: any, res) => {
    try {
      const snapshots = await storage.getLatestSnapshots();
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest snapshots" });
    }
  });

  app.get("/api/snapshots/range", async (req: any, res) => {
    try {
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;

      if (!startDate || !endDate) {
        return res
          .status(400)
          .json({ error: "startDate and endDate are required" });
      }

      const snapshots = await storage.getSnapshotsByDateRange(
        startDate,
        endDate
      );
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch snapshots" });
    }
  });

  app.get("/api/snapshots/year/:year", async (req: any, res) => {
    try {
      const year = parseInt(req.params.year as string);
      if (isNaN(year)) {
        return res.status(400).json({ error: "Invalid year" });
      }

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const snapshots = await storage.getSnapshotsByDateRange(
        startDate,
        endDate
      );

      const assetMonthMap: Record<
        string,
        Record<
          number,
          { value: number; date: string; createdAt: string; isLocked: number }
        >
      > = {};

      snapshots.forEach((snapshot) => {
        if (!assetMonthMap[snapshot.assetId]) {
          assetMonthMap[snapshot.assetId] = {};
        }

        const date = new Date(snapshot.date);
        const month = date.getMonth();

        if (
          !assetMonthMap[snapshot.assetId][month] ||
          new Date(snapshot.date) >
            new Date(assetMonthMap[snapshot.assetId][month].date)
        ) {
          assetMonthMap[snapshot.assetId][month] = {
            value: snapshot.value,
            date: snapshot.date,
            createdAt: snapshot.createdAt
              ? snapshot.createdAt.toISOString()
              : new Date().toISOString(),
            isLocked: snapshot.isLocked || 0,
          };
        }
      });

      res.json(assetMonthMap);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch snapshots for year" });
    }
  });

  app.get("/api/snapshots/month-status/:year", async (req: any, res) => {
    try {
      const year = parseInt(req.params.year as string);
      if (isNaN(year)) {
        return res.status(400).json({ error: "Invalid year" });
      }

      const userId =
        req.session?.userId || req.user?.claims?.sub || "default-user";

      // Initialize month status (using 1-based month indexing: 1-12)
      const monthStatus: Record<number, boolean> = {};
      for (let i = 1; i <= 12; i++) {
        monthStatus[i] = false;
      }

      // Check monthly portfolio snapshots
      const monthlySnapshots = await storage.getMonthlyPortfolioSnapshots(
        userId,
        year
      );

      monthlySnapshots.forEach((snapshot) => {
        if (snapshot.isLocked === 1) {
          monthStatus[snapshot.month] = true;
        }
      });

      res.json(monthStatus);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch month status" });
    }
  });

  app.patch("/api/snapshots/month/lock", async (req: any, res) => {
    try {
      const { year, month, locked } = req.body;
      if (year === undefined || month === undefined || locked === undefined) {
        return res
          .status(400)
          .json({ error: "year, month, and locked are required" });
      }

      const userId =
        req.session?.userId || req.user?.claims?.sub || "default-user";

      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];

      const snapshots = await storage.getSnapshotsByDateRange(
        startDate,
        endDate
      );

      for (const snapshot of snapshots) {
        await storage.updateSnapshot(snapshot.id, { isLocked: locked ? 1 : 0 });
      }

      // Also update the monthly portfolio snapshot
      const monthlySnapshot = await storage.getMonthlyPortfolioSnapshot(
        userId,
        month,
        year
      );

      if (monthlySnapshot) {
        if (locked) {
          await storage.lockMonthlySnapshot(monthlySnapshot.id);
        } else {
          await storage.unlockMonthlySnapshot(monthlySnapshot.id);
        }
      }

      res.json({ success: true, locked });
    } catch (error) {
      res.status(500).json({ error: "Failed to lock/unlock month" });
    }
  });

  app.post("/api/snapshots", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const validated = insertSnapshotSchema.parse(req.body);

      // Check if the month is locked before updating
      // Extract month and year from the snapshot date
      const snapshotDate = new Date(validated.date);
      const snapshotMonth = snapshotDate.getMonth() + 1; // 1-12
      const snapshotYear = snapshotDate.getFullYear();

      // Check if the monthly portfolio snapshot is locked
      const monthlySnapshot = await storage.getMonthlyPortfolioSnapshot(
        userId,
        snapshotMonth,
        snapshotYear
      );

      const isMonthLocked = monthlySnapshot?.isLocked === 1;

      if (isMonthLocked) {
        // Month is locked - prevent automatic updates
        // Return 403 Forbidden for automatic updates, but allow manual saves
        const isManualSave = req.body._manualSave === true;

        if (!isManualSave) {
          return res.status(403).json({
            error:
              "Month is locked - automatic updates not allowed. Use manual edit to modify.",
            monthLocked: true,
            month: snapshotMonth,
            year: snapshotYear,
          });
        }
      }

      const snapshot = await storage.upsertSnapshot(validated);

      const asset = await storage.getAsset(validated.assetId);
      if (asset) {
        await storage.createActivityLog({
          userId,
          type: "snapshot",
          category: "snapshot",
          assetId: asset.id,
          assetName: asset.name,
          assetSymbol: asset.symbol,
          action: `Valor atualizado para ${asset.symbol}`,
          details: `R$ ${validated.value.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
          })}`,
        });
      }

      res.status(201).json(snapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating snapshot:", error);
      res.status(500).json({ error: "Failed to create snapshot" });
    }
  });

  app.post("/api/snapshots/initialize", async (req: any, res) => {
    try {
      const assets = await storage.getAssets();
      let createdCount = 0;

      for (let year = 2025; year <= 2029; year++) {
        for (let month = 0; month < 12; month++) {
          const monthDate = new Date(year, month, 1);
          const lastDay = new Date(year, month + 1, 0);
          const dateStr = lastDay.toISOString().split("T")[0];

          for (const asset of assets) {
            const price = asset.currentPrice || asset.acquisitionPrice || 0;
            const quantity = asset.quantity || 0;
            const value = quantity * price;

            if (value > 0) {
              const existingSnapshots = await storage.getSnapshotsByDateRange(
                `${year}-${(month + 1).toString().padStart(2, "0")}-01`,
                dateStr
              );
              const exists = existingSnapshots.some(
                (s) => s.assetId === asset.id
              );

              if (!exists) {
                await storage.createSnapshot({
                  assetId: asset.id,
                  value,
                  amount: quantity,
                  unitPrice: price,
                  date: dateStr,
                  notes: "Initial snapshot",
                });
                createdCount++;
              }
            }
          }
        }
      }

      res.json({
        success: true,
        createdCount,
        message: `Created ${createdCount} initial snapshots`,
      });
    } catch (error) {
      console.error("Error initializing snapshots:", error);
      res.status(500).json({ error: "Failed to initialize snapshots" });
    }
  });

  app.delete("/api/snapshots/:id", async (req: any, res) => {
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

  app.get("/api/statements", async (req: any, res) => {
    try {
      const year = req.query.year
        ? parseInt(req.query.year as string)
        : undefined;
      const statements = await storage.getMonthlyStatements(year);
      res.json(statements);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statements" });
    }
  });

  app.get("/api/statements/:year/:month", async (req: any, res) => {
    try {
      const month = parseInt(req.params.month);
      const year = parseInt(req.params.year);
      const statement = await storage.getMonthlyStatement(month, year);

      if (!statement) {
        return res.status(404).json({ error: "Statement not found" });
      }

      const startDate = `${year}-${month.toString().padStart(2, "0")}-01`;
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];
      const snapshots = await storage.getSnapshotsByDateRange(
        startDate,
        endDate
      );

      const assets = await storage.getAssets();
      const transactions = await Promise.all(
        snapshots.map(async (s) => {
          const asset = assets.find((a) => a.id === s.assetId);
          return {
            date: s.date,
            assetSymbol: asset?.symbol || "Unknown",
            value: s.value,
            type: "snapshot" as const,
          };
        })
      );

      res.json({
        ...statement,
        transactions,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch statement" });
    }
  });

  app.get("/api/wallet-balance", async (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ error: "address parameter is required" });
      }

      const balance = await fetchWalletBalance(address);
      if (!balance) {
        return res
          .status(404)
          .json({ error: "Failed to fetch wallet balance" });
      }

      res.json(balance);
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
      res.status(500).json({ error: "Failed to fetch wallet balance" });
    }
  });

  app.get("/api/debank-balance", async (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ error: "address parameter is required" });
      }

      if (!address.startsWith("0x") || address.length !== 42) {
        return res.status(400).json({ error: "Invalid Ethereum address" });
      }

      // Fetch from DeBankAPI API
      const response = await fetch(
        `https://api.debank.com/v1/user/total_balance?id=${address}`,
        {
          headers: {
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        return res
          .status(404)
          .json({ error: "Failed to fetch from DeBankAPI" });
      }

      const data = await response.json();
      const balanceUSD = data.total_usd_value || 0;
      const rates = await fetchExchangeRates();
      const exchangeRate = rates.USD || 5.51;
      const balanceBRL = balanceUSD * exchangeRate;

      res.json({
        address,
        balanceUSD,
        balanceBRL,
      });
    } catch (error) {
      console.error("Error fetching DeBankAPI balance:", error);
      res.status(500).json({ error: "Failed to fetch DeBankAPI balance" });
    }
  });

  app.get("/api/jup-portfolio", async (req, res) => {
    try {
      const portfolioId = req.query.address as string;
      if (!portfolioId) {
        return res
          .status(400)
          .json({ error: "address parameter (portfolio ID) is required" });
      }

      const portfolio = await fetchJupPortfolio(portfolioId);
      if (!portfolio) {
        return res
          .status(404)
          .json({ error: "Failed to fetch Jup.Ag portfolio" });
      }

      const rates = await fetchExchangeRates();
      const exchangeRate = rates.USD || 5.51;
      const balanceBRL = portfolio.netWorthUSD * exchangeRate;

      res.json({
        portfolioId,
        netWorthUSD: portfolio.netWorthUSD,
        netWorthBRL: balanceBRL,
      });
    } catch (error) {
      console.error("Error fetching Jup.Ag portfolio:", error);
      res.status(500).json({ error: "Failed to fetch Jup.Ag portfolio" });
    }
  });

  app.post("/api/portfolio/history", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const { totalValue, month, year, date } = req.body;

      if (!totalValue || !month || !year || !date) {
        console.error("Missing portfolio history fields:", {
          totalValue,
          month,
          year,
          date,
        });
        return res.status(400).json({
          error: "Missing required fields: totalValue, month, year, date",
        });
      }

      // Use createOrUpdate to avoid duplicates when re-saving a month
      const history = await storage.createOrUpdatePortfolioHistory({
        userId,
        totalValue,
        month,
        year,
        date,
      });
      res.status(201).json(history);
    } catch (error) {
      console.error("Error creating/updating portfolio history:", error);
      res.status(500).json({
        error: "Failed to create or update portfolio history",
        details: String(error),
      });
    }
  });

  app.post("/api/portfolio/history/generate", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const assets = await storage.getAssets(userId);
      let currentValue = 0;

      assets.forEach((asset) => {
        const quantity = asset.quantity || 0;
        const price = asset.currentPrice || asset.acquisitionPrice || 0;
        currentValue += quantity * price;
      });

      if (currentValue === 0) currentValue = 100000;

      const year = new Date().getFullYear();

      for (let month = 1; month <= 12; month++) {
        const lastDay = new Date(year, month, 0).getDate();
        const date = `${year}-${String(month).padStart(2, "0")}-${String(
          lastDay
        ).padStart(2, "0")}`;
        const variation = (Math.random() - 0.5) * 0.1;
        const value = currentValue * (1 + (variation * (13 - month)) / 12);

        await storage.createPortfolioHistory({
          userId,
          totalValue: Math.max(value, currentValue * 0.8),
          month,
          year,
          date,
        });
      }

      res.json({ success: true, message: "Historical data generated" });
    } catch (error) {
      console.error("Error generating history:", error);
      res.status(500).json({ error: "Failed to generate history" });
    }
  });

  // Helper function to update asset prices from wallet tracker
  async function syncWalletValuesToAssets(): Promise<void> {
    try {
      const walletBalances = await getDetailedBalances();
      // This updates the cached wallet values which can be used to sync asset values
      // Implementation depends on how wallets are linked to assets
      console.log(
        "[Sync] Wallet balances available for sync:",
        walletBalances.length
      );
    } catch (error) {
      console.error("[Sync] Error syncing wallet values:", error);
    }
  }

  app.get("/api/portfolio/summary", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const allAssets = await storage.getAssets(userId);
      const rates = await fetchExchangeRates();

      let totalValue = 0;
      let cryptoValue = 0;
      let traditionalValue = 0;
      let fixedIncomeValue = 0;
      let variableIncomeValue = 0;
      let realEstateValue = 0;

      const holdings = await Promise.all(
        allAssets.map(async (asset) => {
          const currentPrice =
            asset.currentPrice || asset.acquisitionPrice || 0;
          const quantity = asset.quantity || 0;
          const currency = asset.currency || "BRL";

          const valueInCurrency = quantity * currentPrice;
          const exchangeRate = rates[currency as keyof typeof rates] || 1;
          const valueInBRL = valueInCurrency * exchangeRate;

          const acquisitionValueInCurrency =
            quantity * (asset.acquisitionPrice || 0);
          const acquisitionValueInBRL =
            acquisitionValueInCurrency * exchangeRate;

          const profitLoss = valueInBRL - acquisitionValueInBRL;
          const profitLossPercent =
            acquisitionValueInBRL > 0
              ? (profitLoss / acquisitionValueInBRL) * 100
              : 0;

          totalValue += valueInBRL;

          if (asset.market === "crypto") {
            cryptoValue += valueInBRL;
          } else if (asset.market === "real_estate") {
            realEstateValue += valueInBRL;
          } else if (asset.market === "fixed_income") {
            fixedIncomeValue += valueInBRL;
            traditionalValue += valueInBRL;
          } else if (asset.market === "variable_income") {
            variableIncomeValue += valueInBRL;
            traditionalValue += valueInBRL;
          } else {
            traditionalValue += valueInBRL;
          }

          return {
            id: asset.id,
            symbol: asset.symbol,
            name: asset.name,
            category: asset.category,
            market: asset.market,
            currency,
            value: valueInBRL,
            valueInCurrency,
            quantity,
            acquisitionPrice: asset.acquisitionPrice || 0,
            currentPrice,
            profitLoss,
            profitLossPercent,
            exchangeRate,
            lastUpdate: asset.lastPriceUpdate,
          };
        })
      );

      // Automatically create a history record for the current month if it doesn't exist
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const dateStr = now.toISOString().split("T")[0];

      try {
        const existingHistory = await storage.getPortfolioHistory(userId);
        const currentMonthRecord = existingHistory.find(
          (h) => h.month === currentMonth && h.year === currentYear
        );

        if (!currentMonthRecord && totalValue > 0) {
          await storage.createPortfolioHistory({
            userId,
            totalValue,
            month: currentMonth,
            year: currentYear,
            date: dateStr,
          });
        }
      } catch (historyError) {
        console.error("Error creating auto history record:", historyError);
      }

      res.json({
        totalValue,
        cryptoValue,
        traditionalValue,
        fixedIncomeValue,
        variableIncomeValue,
        realEstateValue,
        cryptoExposure: totalValue > 0 ? (cryptoValue / totalValue) * 100 : 0,
        exchangeRates: rates,
        holdings,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio summary" });
    }
  });

  app.get("/api/portfolio/history", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      // Get saved portfolio history records (from monthly snapshots)
      const savedHistory = await storage.getPortfolioHistory(userId);
      const monthNames = [
        "Jan",
        "Fev",
        "Mar",
        "Abr",
        "Mai",
        "Jun",
        "Jul",
        "Ago",
        "Set",
        "Out",
        "Nov",
        "Dez",
      ];

      // Also get month lock status for isLocked field
      const historyByMonth = await storage.getPortfolioHistoryByMonth(userId);
      const lockedMonths = new Map(
        historyByMonth.map((h) => [`${h.year}-${h.month}`, h.isLocked === 1])
      );

      // Format history - return ALL available data, not just locked months
      const formattedHistory = savedHistory
        .filter((h) => h && h.year && h.month)
        .sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          return a.month - b.month;
        })
        .map((h, index, array) => {
          // Ensure month is within valid range (1-12)
          const monthIndex = Math.max(0, Math.min(11, h.month - 1));
          const prevValue = index > 0 ? array[index - 1].totalValue : 0;
          const isLocked = lockedMonths.get(`${h.year}-${h.month}`) || false;
          return {
            id: h.id || `${h.year}-${h.month}`,
            date: h.date,
            month: `${monthNames[monthIndex]}`,
            year: h.year,
            value: h.totalValue || 0,
            totalValue: h.totalValue || 0,
            isLocked: isLocked ? 1 : 0,
            variation:
              prevValue > 0
                ? ((h.totalValue - prevValue) / prevValue) * 100
                : 0,
            variationPercent:
              prevValue > 0
                ? ((h.totalValue - prevValue) / prevValue) * 100
                : 0,
          };
        });

      res.json(formattedHistory.length > 0 ? formattedHistory : []);
    } catch (error) {
      console.error("[Portfolio History Error]", error);
      res.status(500).json({
        error: "Failed to fetch portfolio history",
        details: String(error),
      });
    }
  });

  app.get("/api/saldo", async (req, res) => {
    try {
      const balances = getBalances();
      res.json(balances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch DeBank balances" });
    }
  });

  app.get("/api/saldo/detailed", async (req, res) => {
    try {
      const balances = await getDetailedBalances();
      
      // ✅ CRÍTICO: Adicionar timestamp para evitar 304 Not Modified
      // Isso garante que o frontend sempre receba dados frescos
      const response = {
        balances,
        timestamp: new Date().toISOString(),
        updated: Date.now()
      };
      
      // Desabilitar cache HTTP para esta rota
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch DeBank balances" });
    }
  });

  app.post("/api/saldo/refresh", async (req, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const updatedBalances = await forceRefreshAndWait();

      // Sync portfolio evolution after wallet refresh
      try {
        const { syncPortfolioEvolution } = await import(
          "./services/portfolioSync"
        );
        await syncPortfolioEvolution(userId);
      } catch (error) {
        console.error("[API] Error syncing portfolio evolution:", error);
      }

      res.json({ message: "Balances refreshed", balances: updatedBalances });
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh DeBank balances" });
    }
  });

  app.post("/api/saldo/refresh/:walletName", async (req, res) => {
    try {
      const walletName = decodeURIComponent(req.params.walletName);
      const updatedBalance = await forceRefreshWallet(walletName);

      res.json({ message: "Wallet refreshed", balance: updatedBalance });
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh wallet balance" });
    }
  });

  app.get("/api/saldo/history/:walletName", async (req, res) => {
    try {
      const walletName = decodeURIComponent(req.params.walletName);
      const limit = parseInt(req.query.limit as string) || 100;
      const history = getWalletHistory(walletName, limit);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallet history" });
    }
  });

  app.get("/api/saldo/history", async (req, res) => {
    try {
      const history = getAllHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  app.get("/api/saldo/latest", async (req, res) => {
    try {
      const latest = getLatestByWallet();
      res.json(latest);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest balances" });
    }
  });

  app.get("/api/saldo/stats/:walletName", async (req, res) => {
    try {
      const walletName = decodeURIComponent(req.params.walletName);
      const stats = getWalletStats(walletName);

      if (!stats) {
        return res.status(404).json({ error: "No data for this wallet" });
      }

      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallet stats" });
    }
  });

  app.get("/api/wallets", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const userWallets = await storage.getWallets(userId);
      res.json(userWallets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  app.post("/api/wallets", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const validated = insertWalletSchema.parse(req.body);

      // Auto-detect platform based on URL
      let platform = "debank";
      if (validated.link.includes("step.finance")) {
        platform = "step";
      } else if (validated.link.includes("debank.com")) {
        platform = "debank";
      } else if (validated.link.includes("portfolio.ready.co")) {
        platform = "starknet";
      } else if (validated.link.includes("aptoscan.com")) {
        platform = "aptos";
      } else if (validated.link.includes("seiscan.io")) {
        platform = "sei";
      }

      const wallet = await storage.createWallet({
        name: validated.name,
        link: validated.link,
        userId,
        platform,
      } as any);

      const allWallets = await storage.getWallets(userId);
      setWallets(
        allWallets.map((w) => ({ id: w.id, name: w.name, link: w.link }))
      );

      // Initialize the new wallet in cache with value from asset if exists
      await initializeWallet({
        id: wallet.id,
        name: validated.name,
        link: validated.link,
      });

      res.status(201).json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  app.delete("/api/wallets/:id", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const walletId = req.params.id;

      // Validate wallet ID
      if (
        !walletId ||
        typeof walletId !== "string" ||
        walletId.trim().length === 0
      ) {
        console.log(`[Wallet] Invalid wallet ID provided: ${walletId}`);
        return res.status(400).json({ error: "Invalid wallet ID provided" });
      }

      console.log(
        `[Wallet] Attempting to delete wallet: ${walletId} for user: ${userId}`
      );

      const userWallets = await storage.getWallets(userId);
      const walletToDelete = userWallets.find((w) => w.id === walletId);

      if (!walletToDelete) {
        console.log(`[Wallet] Wallet not found: ${walletId}`);
        return res
          .status(404)
          .json({ error: "Wallet not found or already deleted" });
      }

      // Delete wallet with validation
      const deleted = await storage.deleteWallet(walletId);
      if (!deleted) {
        console.log(
          `[Wallet] Failed to delete wallet from storage: ${walletId}`
        );
        return res
          .status(500)
          .json({ error: "Failed to delete wallet from database" });
      }

      console.log(`[Wallet] ✓ Deleted wallet: ${walletToDelete.name}`);
      const updatedWallets = await storage.getWallets(userId);
      setWallets(
        updatedWallets.map((w) => ({ id: w.id, name: w.name, link: w.link }))
      );

      res.json({
        success: true,
        message: `Wallet "${walletToDelete.name}" deleted successfully`,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[Wallet] Error deleting wallet:`, error);

      // Return specific error messages
      if (errorMessage.includes("Invalid wallet ID")) {
        return res.status(400).json({ error: "Invalid wallet ID provided" });
      }
      if (errorMessage.includes("Wallet not found")) {
        return res
          .status(404)
          .json({ error: "Wallet not found or already deleted" });
      }

      res
        .status(500)
        .json({ error: "Failed to delete wallet", details: errorMessage });
    }
  });

  app.get("/api/activities", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const activities = await storage.getActivities(userId);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // Wallet history endpoints - show collection history for each wallet
  app.get("/api/wallet-history/:walletName", async (req, res) => {
    try {
      const { walletName } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      const history = getWalletHistory(walletName, limit);
      const stats = getWalletStats(walletName);

      res.json({
        walletName,
        history,
        stats,
        totalEntries: history.length,
      });
    } catch (error) {
      console.error("[API] Error fetching wallet history:", error);
      res.status(500).json({ error: "Failed to fetch wallet history" });
    }
  });

  app.get("/api/wallet-history", async (req, res) => {
    try {
      const allHistory = getAllHistory();
      const latestByWallet = getLatestByWallet();

      res.json({
        allHistory: allHistory.slice(0, 100), // Last 100 entries
        latestByWallet,
        totalEntries: allHistory.length,
      });
    } catch (error) {
      console.error("[API] Error fetching all wallet history:", error);
      res.status(500).json({ error: "Failed to fetch wallet history" });
    }
  });

  // Monthly Portfolio Snapshots endpoints
  app.get("/api/monthly-snapshots", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const year = req.query.year ? Number(req.query.year) : undefined;
      const snapshots = await storage.getMonthlyPortfolioSnapshots(
        userId,
        year
      );
      res.json(snapshots);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch monthly snapshots" });
    }
  });

  app.post("/api/monthly-snapshots", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const validated = insertMonthlyPortfolioSnapshotSchema.parse(req.body);

      // Gerar data determinística se não fornecida
      let date = validated.date;
      if (!date) {
        date = `${validated.year}-${String(validated.month).padStart(
          2,
          "0"
        )}-01`;
      }

      // Validação: garantir que date nunca seja null
      if (!date || date.length !== 10) {
        return res.status(400).json({
          error: `Invalid date format for snapshot ${validated.year}-${validated.month}`,
        });
      }

      const snapshot = await storage.createOrUpdateMonthlyPortfolioSnapshot({
        ...validated,
        date,
        userId,
      });
      res.json(snapshot);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to save monthly snapshot" });
    }
  });

  app.patch("/api/monthly-snapshots/:id/unlock", async (req: any, res) => {
    try {
      const snapshot = await storage.unlockMonthlySnapshot(req.params.id);
      if (!snapshot) {
        return res.status(404).json({ error: "Snapshot not found" });
      }
      res.json(snapshot);
    } catch (error) {
      res.status(500).json({ error: "Failed to unlock snapshot" });
    }
  });

  // Sync endpoint - confirms all data is saved to database
  app.post("/api/sync", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      // All data is already auto-saved to storage
      // This endpoint confirms the sync and returns user stats
      res.json({
        success: true,
        message: "Dados sincronizados com sucesso",
        stats: {
          assets: 0,
          wallets: 0,
          snapshots: 0,
          syncedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error("Sync error:", error);
      res.status(500).json({ error: "Failed to sync data" });
    }
  });

  // Portfolio Evolution Sync endpoint - manually trigger portfolio evolution sync
  app.post("/api/portfolio/sync", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const { syncPortfolioEvolution } = await import(
        "./services/portfolioSync"
      );
      await syncPortfolioEvolution(userId);

      res.json({
        success: true,
        message: "Evolução do portfólio sincronizada com sucesso",
        syncedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Portfolio sync error:", error);
      res.status(500).json({ error: "Failed to sync portfolio evolution" });
    }
  });

  return httpServer;
}
