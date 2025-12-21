import { Express } from "express";
import { getBalances, getDetailedBalances, forceRefreshAndWait, forceRefreshWallet, getWalletHistory, getAllHistory, getLatestByWallet, getWalletStats } from "./debankScraper";
import { storage } from "../storage";

export function registerWalletRoutes(app: Express) {
  // Get simple balances
  app.get("/api/saldo", async (req, res) => {
    try {
      const balances = getBalances();
      res.json(balances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch DeBank balances" });
    }
  });

  // Get detailed balances (main endpoint used by frontend)
  app.get("/api/saldo/detailed", async (req, res) => {
    try {
      const balances = getDetailedBalances();
      res.json(balances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch DeBank balances" });
    }
  });

  // Force refresh all wallets immediately
  app.post("/api/saldo/refresh", async (req, res) => {
    try {
      const updatedBalances = await forceRefreshAndWait();
      res.json({ message: "Balances refreshed", balances: updatedBalances });
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh DeBank balances" });
    }
  });

  // Force refresh specific wallet
  app.post("/api/saldo/refresh/:walletName", async (req, res) => {
    try {
      const walletName = decodeURIComponent(req.params.walletName);
      const updatedBalance = await forceRefreshWallet(walletName);

      res.json({ message: "Wallet refreshed", balance: updatedBalance });
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh wallet balance" });
    }
  });

  // Get history for specific wallet
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

  // Get all history
  app.get("/api/saldo/history", async (req, res) => {
    try {
      const history = getAllHistory();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });

  // Get latest balances by wallet
  app.get("/api/saldo/latest", async (req, res) => {
    try {
      const latest = getLatestByWallet();
      res.json(latest);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch latest balances" });
    }
  });

  // Get statistics for specific wallet
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

  // Get wallets list
  app.get("/api/wallets", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const userWallets = await storage.getWallets(userId);
      res.json(userWallets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });
}