import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertAssetSchema,
  insertSnapshotSchema,
  insertWalletSchema,
  insertMonthlyPortfolioSnapshotSchema,
  monthlyPortfolioSnapshots,
} from "@shared/schema";
import { z } from "zod";
import { db } from "./db";
import { eq, asc, sql } from "drizzle-orm";

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
  fetchDetailedTokens,
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
    "portfolio_total",
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

  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/database-status", async (req, res) => {
    try {
      const { supabase } = await import("./supabase");
      const { data, error } = await supabase.from("users").select("*").limit(1);
      if (error) return res.json({ connected: false, error: error.message });
      res.json({ connected: true });
    } catch (error) {
      res.json({ connected: false, error: String(error) });
    }
  });

  app.post("/login", (req, res) => {
    const { usernameOrEmail, password } = req.body;
    const result = validateCredentials(usernameOrEmail, password);
    if (!result.success) return res.status(401).json(result);
    res.json(result);
  });

  app.get("/api/assets", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
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

  app.get("/api/debank/detailed-tokens", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const wallets = await storage.getWallets(userId);
      const debankWallets = wallets.filter(w => w.link.includes("debank.com"));
      const results = [];
      for (const wallet of debankWallets) {
        try {
          const tokens = await fetchDetailedTokens(wallet.link);
          results.push({
            walletName: wallet.name,
            walletAddress: wallet.link.split('/').pop(),
            tokens: tokens,
            totalValue: tokens.reduce((acc: number, t: any) => acc + (t.value || 0), 0)
          });
        } catch (err) {
          console.error(`Error fetching tokens for ${wallet.name}:`, err);
        }
      }
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch detailed tokens" });
    }
  });

  app.post("/api/wallets", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const validated = insertWalletSchema.parse(req.body);
      let platform = "debank";
      if (validated.link.includes("step.finance")) platform = "step";
      else if (validated.link.includes("debank.com")) platform = "debank";
      else if (validated.link.includes("portfolio.ready.co")) platform = "starknet";

      const wallet = await storage.createWallet({
        ...validated,
        userId,
        platform,
      } as any);

      const allWallets = await storage.getWallets(userId);
      setWallets(allWallets.map(w => ({ id: w.id, name: w.name, link: w.link })));
      await initializeWallet({ id: wallet.id, name: wallet.name, link: wallet.link });
      res.status(201).json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  app.get("/api/wallets", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const userWallets = await storage.getWallets(userId);
      res.json(userWallets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  app.get("/api/saldo/history", async (req, res) => {
    res.json(getAllHistory());
  });

  app.get("/api/saldo/latest", async (req, res) => {
    res.json(getLatestByWallet());
  });

  app.get("/api/saldo/stats/:walletName", async (req, res) => {
    const stats = getWalletStats(decodeURIComponent(req.params.walletName));
    if (!stats) return res.status(404).json({ error: "No data" });
    res.json(stats);
  });

  return createServer(app);
}
