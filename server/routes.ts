import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAssetSchema, insertSnapshotSchema, insertWalletSchema } from "@shared/schema";
import { z } from "zod";
import { isAuthenticated } from "./replit_integrations/auth";
import { fetchAssetPrice, updateAssetPrice, startPriceUpdater, fetchHistoricalAssetPrice } from "./services/pricing";
import { fetchExchangeRates, convertToBRL, getExchangeRate } from "./services/exchangeRate";
import { fetchWalletBalance } from "./services/walletBalance";
import { getBalances, getDetailedBalances, startStepMonitor, forceRefresh, forceRefreshAndWait, setWallets, forceRefreshWallet, initializeWallet } from "./services/debankScraper";
import { getWalletHistory, getAllHistory, getLatestByWallet, getWalletStats } from "./services/walletCache";
import { fetchJupPortfolio } from "./services/jupAgScraper";
import { validateCredentials } from "./sqlite-auth";

const investmentSchema = z.object({
  name: z.string().min(1),
  symbol: z.string().min(1),
  category: z.string(),
  market: z.enum(["crypto", "fixed_income", "variable_income", "real_estate"]),
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
  startStepMonitor(60 * 60 * 1000); // 1 hour with 5 second spacing between wallets

  // SQLite authentication routes
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.post("/login", (req, res) => {
    const { usernameOrEmail, password } = req.body;
    const result = validateCredentials(usernameOrEmail, password);
    
    if (!result.success) {
      return res.status(401).json(result);
    }

    res.json(result);
  });

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
    const userId = req.user?.claims?.sub;
    try {
      const oldAsset = await storage.getAsset(req.params.id);
      const validated = insertAssetSchema.partial().parse(req.body);
      const asset = await storage.updateAsset(req.params.id, validated);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }
      
      if (oldAsset) {
        const changes = [];
        if (validated.quantity !== undefined && oldAsset.quantity !== validated.quantity) {
          changes.push(`Quantidade: ${oldAsset.quantity} → ${validated.quantity}`);
        }
        if (validated.acquisitionPrice !== undefined && oldAsset.acquisitionPrice !== validated.acquisitionPrice) {
          changes.push(`Preço de aquisição: ${oldAsset.acquisitionPrice} → ${validated.acquisitionPrice}`);
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
      
      res.json(asset);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to update asset" });
    }
  });

  app.delete("/api/assets/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
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
      
      await storage.updateAsset(req.params.id, { isDeleted: 1, deletedAt: new Date() });
      res.json({ success: true, message: "Asset deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete asset" });
    }
  });

  app.get("/api/assets/history/all", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const allAssets = await storage.getAllAssetsIncludingDeleted(userId);
      res.json(allAssets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assets history" });
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

  app.post("/api/investments", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
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
      
      if (validated.market === "crypto" || validated.market === "variable_income") {
        const price = await fetchAssetPrice(asset.symbol, asset.market);
        if (price !== null) {
          await storage.updateAsset(asset.id, { 
            currentPrice: price, 
            lastPriceUpdate: new Date() 
          });
        }
      } else {
        await storage.updateAsset(asset.id, { 
          currentPrice: validated.acquisitionPrice,
          lastPriceUpdate: new Date() 
        });
      }
      
      const updatedAsset = await storage.getAsset(asset.id);
      const currentPrice = updatedAsset?.currentPrice || validated.acquisitionPrice;
      const totalValueInCurrency = validated.quantity * currentPrice;
      const totalValueBRL = await convertToBRL(totalValueInCurrency, validated.currency);
      
      await storage.createSnapshot({
        assetId: asset.id,
        value: totalValueBRL,
        amount: validated.quantity,
        unitPrice: validated.acquisitionPrice,
        date: validated.acquisitionDate,
        notes: "Aquisição inicial"
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
        return res.json({ symbol: symbol.toUpperCase(), price: null, currency: "BRL", error: "Price not found" });
      }
      
      res.json({ symbol: symbol.toUpperCase(), price, currency: "BRL" });
    } catch (error) {
      res.json({ symbol: symbol.toUpperCase(), price: null, currency: "BRL", error: "Failed to fetch price" });
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

  app.patch("/api/investments/:id", isAuthenticated, async (req: any, res) => {
    try {
      const asset = await storage.getAsset(req.params.id);
      if (!asset) {
        return res.status(404).json({ error: "Asset not found" });
      }

      const { name, symbol, quantity, acquisitionPrice, acquisitionDate, currentPrice } = req.body;

      const updates: any = {};
      if (name !== undefined) updates.name = name;
      if (symbol !== undefined) updates.symbol = symbol.toUpperCase();
      if (quantity !== undefined) updates.quantity = quantity;
      if (acquisitionPrice !== undefined) updates.acquisitionPrice = acquisitionPrice;
      if (acquisitionDate !== undefined) updates.acquisitionDate = acquisitionDate;
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
          date: new Date().toISOString().split('T')[0],
          notes: "Atualização manual"
        });
      }

      res.json(updatedAsset);
    } catch (error) {
      console.error("Error updating investment:", error);
      res.status(500).json({ error: "Failed to update investment" });
    }
  });

  app.post("/api/investments/:id/preview-historical", isAuthenticated, async (req: any, res) => {
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
        return res.status(400).json({ error: "Cannot update historical price for stable assets" });
      }

      // Fetch historical price for the specified date
      const historicalPrice = await fetchHistoricalAssetPrice(asset.symbol, asset.market, updateDate);
      if (historicalPrice === null) {
        return res.status(400).json({ error: "Could not fetch historical price for this date. Available for crypto assets only." });
      }

      // Calculate total value with historical price
      const assetQuantity = quantity || asset.quantity || 1;
      const totalValue = await convertToBRL(assetQuantity * historicalPrice, asset.currency);

      res.json({ price: historicalPrice, total: totalValue });
    } catch (error) {
      console.error("Error previewing historical investment:", error);
      res.status(500).json({ error: "Failed to preview historical investment" });
    }
  });

  app.post("/api/investments/:id/update-historical", isAuthenticated, async (req: any, res) => {
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
        return res.status(400).json({ error: "Cannot update historical price for stable assets" });
      }

      // Fetch historical price for the specified date
      const historicalPrice = await fetchHistoricalAssetPrice(asset.symbol, asset.market, updateDate);
      if (historicalPrice === null) {
        return res.status(400).json({ error: "Could not fetch historical price for this date. Available for crypto assets only." });
      }

      // Calculate total value with historical price
      const assetQuantity = quantity || asset.quantity || 1;
      const totalValue = await convertToBRL(assetQuantity * historicalPrice, asset.currency);

      // Create snapshot with historical data
      const snapshot = await storage.createSnapshot({
        assetId: req.params.id,
        value: totalValue,
        amount: assetQuantity,
        unitPrice: historicalPrice,
        date: updateDate,
        notes: `Atualização histórica - ${historicalPrice.toFixed(2)} BRL por unidade`
      });

      res.status(201).json(snapshot);
    } catch (error) {
      console.error("Error updating historical investment:", error);
      res.status(500).json({ error: "Failed to update historical investment" });
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

  app.get("/api/snapshots/year/:year", isAuthenticated, async (req: any, res) => {
    try {
      const year = parseInt(req.params.year as string);
      if (isNaN(year)) {
        return res.status(400).json({ error: "Invalid year" });
      }
      
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;
      
      const snapshots = await storage.getSnapshotsByDateRange(startDate, endDate);
      
      const assetMonthMap: Record<string, Record<number, { value: number; date: string }>> = {};
      
      snapshots.forEach(snapshot => {
        if (!assetMonthMap[snapshot.assetId]) {
          assetMonthMap[snapshot.assetId] = {};
        }
        
        const date = new Date(snapshot.date);
        const month = date.getMonth();
        
        if (!assetMonthMap[snapshot.assetId][month] || new Date(snapshot.date) > new Date(assetMonthMap[snapshot.assetId][month].date)) {
          assetMonthMap[snapshot.assetId][month] = {
            value: snapshot.value,
            date: snapshot.date
          };
        }
      });
      
      res.json(assetMonthMap);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch snapshots for year" });
    }
  });

  app.post("/api/snapshots", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const validated = insertSnapshotSchema.parse(req.body);
      const snapshot = await storage.createSnapshot(validated);
      
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
          details: `R$ ${validated.value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
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

  app.get("/api/wallet-balance", async (req, res) => {
    try {
      const address = req.query.address as string;
      if (!address) {
        return res.status(400).json({ error: "address parameter is required" });
      }

      const balance = await fetchWalletBalance(address);
      if (!balance) {
        return res.status(404).json({ error: "Failed to fetch wallet balance" });
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
      const response = await fetch(`https://api.debank.com/v1/user/total_balance?id=${address}`, {
        headers: {
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        return res.status(404).json({ error: "Failed to fetch from DeBankAPI" });
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
        return res.status(400).json({ error: "address parameter (portfolio ID) is required" });
      }

      const portfolio = await fetchJupPortfolio(portfolioId);
      if (!portfolio) {
        return res.status(404).json({ error: "Failed to fetch Jup.Ag portfolio" });
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

  app.get("/api/portfolio/history", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const history = await storage.getPortfolioHistoryBySnapshots(userId);
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio history" });
    }
  });

  app.post("/api/portfolio/history", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const { totalValue, month, year, date } = req.body;
      const history = await storage.createPortfolioHistory({
        userId,
        totalValue,
        month,
        year,
        date
      });
      res.status(201).json(history);
    } catch (error) {
      res.status(500).json({ error: "Failed to create portfolio history" });
    }
  });

  app.get("/api/portfolio/summary", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const allAssets = await storage.getAssets(userId);
      const rates = await fetchExchangeRates();
      
      let totalValue = 0;
      let cryptoValue = 0;
      let traditionalValue = 0;
      let fixedIncomeValue = 0;
      let variableIncomeValue = 0;
      let realEstateValue = 0;
      
      const holdings = await Promise.all(allAssets.map(async (asset) => {
        const currentPrice = asset.currentPrice || asset.acquisitionPrice || 0;
        const quantity = asset.quantity || 0;
        const currency = asset.currency || "BRL";
        
        const valueInCurrency = quantity * currentPrice;
        const exchangeRate = rates[currency as keyof typeof rates] || 1;
        const valueInBRL = valueInCurrency * exchangeRate;
        
        const acquisitionValueInCurrency = quantity * (asset.acquisitionPrice || 0);
        const acquisitionValueInBRL = acquisitionValueInCurrency * exchangeRate;
        
        const profitLoss = valueInBRL - acquisitionValueInBRL;
        const profitLossPercent = acquisitionValueInBRL > 0 ? (profitLoss / acquisitionValueInBRL) * 100 : 0;
        
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
          lastUpdate: asset.lastPriceUpdate
        };
      }));
      
      // Automatically create a history record for the current month if it doesn't exist
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      const dateStr = now.toISOString().split('T')[0];

      try {
        const existingHistory = await storage.getPortfolioHistory(userId);
        const currentMonthRecord = existingHistory.find(h => h.month === currentMonth && h.year === currentYear);

        if (!currentMonthRecord && totalValue > 0) {
          await storage.createPortfolioHistory({
            userId,
            totalValue,
            month: currentMonth,
            year: currentYear,
            date: dateStr
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
        holdings
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio summary" });
    }
  });

  app.get("/api/portfolio/history", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      // Get history from snapshots (this includes ALL investments: cripto, renda fixa, renda variável, imóveis)
      const historyByMonth = await storage.getPortfolioHistoryByMonth(userId);
      const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      
      const formattedHistory = historyByMonth
        .map((h, index, array) => {
          const prevValue = index > 0 ? array[index - 1].value : 0;
          return {
            month: `${monthNames[h.month - 1]}`,
            year: h.year,
            value: h.value,
            totalValue: h.value,
            variation: prevValue > 0 ? ((h.value - prevValue) / prevValue) * 100 : 0,
            variationPercent: prevValue > 0 ? ((h.value - prevValue) / prevValue) * 100 : 0
          };
        });
      
      res.json(formattedHistory);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch portfolio history" });
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
      const balances = getDetailedBalances();
      res.json(balances);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch DeBank balances" });
    }
  });

  app.post("/api/saldo/refresh", async (req, res) => {
    try {
      const updatedBalances = await forceRefreshAndWait();
      res.json({ message: "Balances refreshed", balances: updatedBalances });
    } catch (error) {
      res.status(500).json({ error: "Failed to refresh DeBank balances" });
    }
  });

  app.post("/api/saldo/refresh/:walletName", async (req, res) => {
    try {
      const walletName = decodeURIComponent(req.params.walletName);
      const updatedBalance = await forceRefreshWallet(walletName);
      
      if (!updatedBalance) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
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

  app.get("/api/wallets", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const userWallets = await storage.getWallets(userId);
      res.json(userWallets);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch wallets" });
    }
  });

  app.post("/api/wallets", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
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
        platform
      } as any);
      
      const allWallets = await storage.getWallets(userId);
      setWallets(allWallets.map(w => ({ id: w.id, name: w.name, link: w.link })));
      
      // Initialize the new wallet in cache so it appears immediately
      initializeWallet({ id: wallet.id, name: validated.name, link: validated.link });
      
      res.status(201).json(wallet);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      res.status(500).json({ error: "Failed to create wallet" });
    }
  });


  app.delete("/api/wallets/:id", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const userWallets = await storage.getWallets(userId);
      const walletExists = userWallets.some(w => w.id === req.params.id);
      
      if (!walletExists) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      const deleted = await storage.deleteWallet(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "Wallet not found" });
      }
      
      const updatedWallets = await storage.getWallets(userId);
      setWallets(updatedWallets.map(w => ({ id: w.id, name: w.name, link: w.link })));
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete wallet" });
    }
  });

  app.get("/api/activities", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      const activities = await storage.getActivities(userId);
      res.json(activities);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });

  // Sync endpoint - confirms all data is saved to database
  app.post("/api/sync", isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;
    try {
      // All data is already auto-saved to PostgreSQL
      // This endpoint confirms the sync and returns user stats
      const assets = await storage.getAssets(userId);
      const wallets = await storage.getWallets(userId);
      const snapshots = await storage.getSnapshots();
      
      res.json({
        success: true,
        message: "Dados sincronizados com sucesso",
        stats: {
          assets: assets.length,
          wallets: wallets.length,
          snapshots: snapshots.length,
          syncedAt: new Date().toISOString(),
        }
      });
    } catch (error) {
      console.error("Sync error:", error);
      res.status(500).json({ error: "Failed to sync data" });
    }
  });

  return httpServer;
}
