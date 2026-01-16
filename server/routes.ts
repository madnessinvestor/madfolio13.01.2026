import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWalletSchema } from "@shared/schema";
import { z } from "zod";
import { validateCredentials } from "./sqlite-auth";
import {
  setWallets,
  initializeWallet,
  startPriceUpdater,
} from "./services/debankScraper";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  startPriceUpdater(5 * 60 * 1000);

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.post("/login", (req, res) => {
    const { usernameOrEmail, password } = req.body;
    const result = validateCredentials(usernameOrEmail, password);
    if (!result.success) return res.status(401).json(result);
    res.json(result);
  });

  app.get("/api/assets", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    res.json(await storage.getAssets(userId));
  });

  app.get("/api/debank/detailed-tokens", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const wallets = await storage.getWallets(userId);
      const debankWallets = wallets.filter((w) =>
        w.link.includes("debank.com")
      );

      // If no debank wallets, return empty array
      if (debankWallets.length === 0) {
        return res.json([]);
      }

      let browser = null;
      let browserAvailable = false;

      try {
        const puppeteerExtra = (await import("puppeteer-extra")).default;
        const StealthPlugin = (await import("puppeteer-extra-plugin-stealth"))
          .default;
        puppeteerExtra.use(StealthPlugin());

        browser = await puppeteerExtra.launch({
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
        browserAvailable = true;
        console.log("[Tokens] Browser launched successfully");
      } catch (browserError) {
        console.log(
          "[Tokens] Browser launch failed, will return mock data:",
          browserError.message
        );
        browserAvailable = false;
      }

      const results = [];

      if (browserAvailable && browser) {
        // Try to scrape with browser
        try {
          const { fetchDetailedTokens } = await import(
            "./services/platformScrapers"
          );
          for (const wallet of debankWallets) {
            // Normalize URL: ensure it's in format https://debank.com/profile/0x...
            let walletUrl = wallet.link;
            let walletAddress = "";

            // Extract wallet address from link
            if (walletUrl.includes("debank.com/profile/")) {
              walletAddress = walletUrl.split("/profile/").pop() || "";
            } else if (walletUrl.startsWith("0x")) {
              // If link is just the address, build the full URL
              walletAddress = walletUrl;
              walletUrl = `https://debank.com/profile/${walletAddress}`;
            } else {
              // Try to extract address from any format
              const addressMatch = walletUrl.match(/0x[a-fA-F0-9]{40}/);
              if (addressMatch) {
                walletAddress = addressMatch[0];
                walletUrl = `https://debank.com/profile/${walletAddress}`;
              }
            }

            console.log(`[Tokens] Scraping wallet: ${wallet.name}`);
            console.log(`[Tokens] URL: ${walletUrl}`);
            console.log(`[Tokens] Address: ${walletAddress}`);

            const tokens = await fetchDetailedTokens(walletUrl, browser);
            console.log(
              `[Tokens] Found ${tokens.length} tokens for ${wallet.name}`
            );

            results.push({
              walletName: wallet.name,
              walletAddress: walletAddress,
              tokens: tokens,
              totalValue: tokens.reduce((acc, t) => acc + (t.value || 0), 0),
            });
          }
        } catch (scrapeError) {
          console.error("[Tokens] Scraping error:", scrapeError);
        } finally {
          await browser.close();
        }
      } else {
        // Browser not available - return empty tokens for each wallet
        for (const wallet of debankWallets) {
          // Extract address even when browser is not available
          let walletAddress = "";
          if (wallet.link.includes("debank.com/profile/")) {
            walletAddress = wallet.link.split("/profile/").pop() || "";
          } else if (wallet.link.startsWith("0x")) {
            walletAddress = wallet.link;
          } else {
            const addressMatch = wallet.link.match(/0x[a-fA-F0-9]{40}/);
            if (addressMatch) {
              walletAddress = addressMatch[0];
            }
          }

          results.push({
            walletName: wallet.name,
            walletAddress: walletAddress,
            tokens: [],
            totalValue: 0,
          });
        }
        console.log(
          "[Tokens] Returning empty token list (browser unavailable)"
        );
      }

      res.json(results);
    } catch (error) {
      console.error("[Tokens] Fatal error:", error);
      res.status(500).json({
        error: "Failed to fetch detailed tokens",
        details: error.message,
      });
    }
  });

  app.get("/api/wallets", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    res.json(await storage.getWallets(userId));
  });

  app.post("/api/wallets", async (req: any, res) => {
    const userId =
      req.session?.userId || req.user?.claims?.sub || "default-user";
    try {
      const validated = insertWalletSchema.parse(req.body);
      const wallet = await storage.createWallet({
        ...validated,
        userId,
        platform: "debank",
      } as any);
      const allWallets = await storage.getWallets(userId);
      setWallets(
        allWallets.map((w) => ({ id: w.id, name: w.name, link: w.link }))
      );
      await initializeWallet({
        id: wallet.id,
        name: wallet.name,
        link: wallet.link,
      });
      res.status(201).json(wallet);
    } catch (error) {
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });

  return createServer(app);
}
