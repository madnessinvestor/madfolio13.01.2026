import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWalletSchema } from "@shared/schema";
import { z } from "zod";
import { validateCredentials } from "./sqlite-auth";
import { setWallets, initializeWallet, startPriceUpdater } from "./services/debankScraper";

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  startPriceUpdater(5 * 60 * 1000);

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.post("/login", (req, res) => {
    const { usernameOrEmail, password } = req.body;
    const result = validateCredentials(usernameOrEmail, password);
    if (!result.success) return res.status(401).json(result);
    res.json(result);
  });

  app.get("/api/assets", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    res.json(await storage.getAssets(userId));
  });

  app.get("/api/debank/detailed-tokens", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const wallets = await storage.getWallets(userId);
      const debankWallets = wallets.filter(w => w.link.includes("debank.com"));
      
      const puppeteerExtra = (await import("puppeteer-extra")).default;
      const StealthPlugin = (await import("puppeteer-extra-plugin-stealth")).default;
      puppeteerExtra.use(StealthPlugin());
      
      const browser = await puppeteerExtra.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
      });

      const results = [];
      try {
        const { fetchDetailedTokens } = await import("./services/platformScrapers");
        for (const wallet of debankWallets) {
          const tokens = await fetchDetailedTokens(wallet.link, browser);
          results.push({
            walletName: wallet.name,
            walletAddress: wallet.link.split('/').pop(),
            tokens: tokens,
            totalValue: tokens.reduce((acc, t) => acc + (t.value || 0), 0)
          });
        }
      } finally {
        await browser.close();
      }
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch detailed tokens" });
    }
  });

  app.get("/api/wallets", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    res.json(await storage.getWallets(userId));
  });

  app.post("/api/wallets", async (req: any, res) => {
    const userId = req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const validated = insertWalletSchema.parse(req.body);
      const wallet = await storage.createWallet({ ...validated, userId, platform: "debank" } as any);
      const allWallets = await storage.getWallets(userId);
      setWallets(allWallets.map(w => ({ id: w.id, name: w.name, link: w.link })));
      await initializeWallet({ id: wallet.id, name: wallet.name, link: wallet.link });
      res.status(201).json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  return createServer(app);
}
