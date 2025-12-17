import { db } from "../db";
import { assets } from "@shared/schema";
import { eq } from "drizzle-orm";

const COINGECKO_API = "https://api.coingecko.com/api/v3";
const BRAPI_API = "https://brapi.dev/api";

const CRYPTO_SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  DOT: "polkadot",
  AVAX: "avalanche-2",
  MATIC: "matic-network",
  LINK: "chainlink",
  UNI: "uniswap",
  ATOM: "cosmos",
  XRP: "ripple",
  DOGE: "dogecoin",
  SHIB: "shiba-inu",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  ALGO: "algorand",
  VET: "vechain",
  FIL: "filecoin",
  THETA: "theta-token",
  TRX: "tron",
  EOS: "eos",
  XTZ: "tezos",
  AAVE: "aave",
  MKR: "maker",
  COMP: "compound-governance-token",
  SNX: "havven",
  YFI: "yearn-finance",
  SUSHI: "sushi",
  CRV: "curve-dao-token",
};

interface CryptoPrice {
  symbol: string;
  price: number;
  currency: string;
}

interface StockPrice {
  symbol: string;
  price: number;
  currency: string;
}

export async function fetchCryptoPrice(symbol: string): Promise<CryptoPrice | null> {
  try {
    const coinId = CRYPTO_SYMBOL_MAP[symbol.toUpperCase()];
    if (!coinId) {
      const searchUrl = `${COINGECKO_API}/search?query=${symbol}`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) return null;
      
      const searchData = await searchRes.json();
      const coin = searchData.coins?.[0];
      if (!coin) return null;
      
      const priceUrl = `${COINGECKO_API}/simple/price?ids=${coin.id}&vs_currencies=brl`;
      const priceRes = await fetch(priceUrl);
      if (!priceRes.ok) return null;
      
      const priceData = await priceRes.json();
      const price = priceData[coin.id]?.brl;
      if (!price) return null;
      
      return { symbol: symbol.toUpperCase(), price, currency: "BRL" };
    }

    const url = `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=brl`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const price = data[coinId]?.brl;
    if (!price) return null;

    return { symbol: symbol.toUpperCase(), price, currency: "BRL" };
  } catch (error) {
    console.error(`Error fetching crypto price for ${symbol}:`, error);
    return null;
  }
}

export async function fetchBrazilianStockPrice(symbol: string): Promise<StockPrice | null> {
  try {
    const url = `${BRAPI_API}/quote/${symbol.toUpperCase()}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const result = data.results?.[0];
    if (!result || !result.regularMarketPrice) return null;

    return {
      symbol: symbol.toUpperCase(),
      price: result.regularMarketPrice,
      currency: "BRL",
    };
  } catch (error) {
    console.error(`Error fetching stock price for ${symbol}:`, error);
    return null;
  }
}

export async function fetchAssetPrice(symbol: string, market: string): Promise<number | null> {
  if (market === "crypto") {
    const result = await fetchCryptoPrice(symbol);
    return result?.price || null;
  } else if (market === "variable_income" || market === "traditional") {
    const result = await fetchBrazilianStockPrice(symbol);
    return result?.price || null;
  } else {
    return null;
  }
}

export async function updateAssetPrice(assetId: string): Promise<number | null> {
  try {
    const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
    if (!asset) return null;

    if (asset.market === "fixed_income" || asset.market === "real_estate") {
      return asset.currentPrice;
    }

    const price = await fetchAssetPrice(asset.symbol, asset.market);
    if (price === null) return null;

    await db.update(assets).set({
      currentPrice: price,
      lastPriceUpdate: new Date(),
    }).where(eq(assets.id, assetId));

    return price;
  } catch (error) {
    console.error(`Error updating price for asset ${assetId}:`, error);
    return null;
  }
}

export async function updateAllAssetPrices(): Promise<void> {
  try {
    const allAssets = await db.select().from(assets);
    
    for (const asset of allAssets) {
      await updateAssetPrice(asset.id);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    console.error("Error updating all asset prices:", error);
  }
}

let priceUpdateInterval: NodeJS.Timeout | null = null;

export function startPriceUpdater(intervalMs: number = 5 * 60 * 1000): void {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
  }
  
  updateAllAssetPrices();
  
  priceUpdateInterval = setInterval(() => {
    updateAllAssetPrices();
  }, intervalMs);
}

export function stopPriceUpdater(): void {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
    priceUpdateInterval = null;
  }
}
