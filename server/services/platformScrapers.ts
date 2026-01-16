import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import Tesseract from "tesseract.js";

puppeteerExtra.use(StealthPlugin());

export interface ScraperResult {
  value: string | null;
  success: boolean;
  platform: string;
  error?: string;
}

export async function fetchDetailedTokens(
  walletUrl: string,
  browser: Browser
): Promise<any[]> {
  console.log("[DeBank] 🚀 Iniciando extração detalhada de tokens:", walletUrl);
  const page = await browser.newPage();

  try {
    // Set realistic browser headers
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
    });

    await page.goto(walletUrl, { waitUntil: "networkidle2", timeout: 60000 });

    console.log("[DeBank] ⏳ Aguardando renderização dos tokens...");
    // Wait for the page to fully load
    await new Promise((resolve) => setTimeout(resolve, 8000));

    // Scroll to load lazy-loaded content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const tokens = await page.evaluate(() => {
      const results: any[] = [];

      console.log("[DeBank] Starting token extraction from page");

      // Function to parse currency values
      const parseCurrency = (text: string): number => {
        if (!text) return 0;
        const cleaned = text.replace(/[$,\s]/g, "");
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Function to parse token amounts
      const parseAmount = (text: string): number => {
        if (!text) return 0;
        const cleaned = text.replace(/[,\s]/g, "");
        const parsed = parseFloat(cleaned);
        return isNaN(parsed) ? 0 : parsed;
      };

      // Try multiple selectors for token rows
      const possibleSelectors = [
        // DeBank token list table rows
        '[class*="TokenList"] [class*="row"]:not([class*="header"])',
        '[class*="AssetList"] [class*="row"]:not([class*="header"])',
        '[class*="PortfolioAsset_row"]',
        '[class*="TokenTable"] tbody tr',
        'div[class*="TokenItem"]',
        // Generic table rows that might contain tokens
        "table tbody tr",
        '[role="row"]',
      ];

      let allRows: Element[] = [];
      for (const selector of possibleSelectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        console.log(
          `[DeBank] Selector "${selector}" found ${elements.length} elements`
        );
        if (elements.length > 0) {
          allRows = elements;
          break;
        }
      }

      console.log(`[DeBank] Processing ${allRows.length} potential token rows`);

      allRows.forEach((row, index) => {
        try {
          const rowText = row.textContent || "";

          // Extract token info from the row
          // Look for: symbol, name, amount, chain, price, value, protocol

          // Symbol and name (usually in first cell or with specific classes)
          let symbol = "";
          let name = "";
          let logo = "";

          const symbolElements = row.querySelectorAll(
            '[class*="symbol"], [class*="Symbol"], [class*="token-symbol"]'
          );
          const nameElements = row.querySelectorAll(
            '[class*="name"], [class*="Name"], [class*="token-name"]'
          );
          const logoElements = row.querySelectorAll(
            'img[src*="token"], img[alt*="token"], img[src*="logo"]'
          );

          if (symbolElements.length > 0) {
            symbol = symbolElements[0].textContent?.trim() || "";
          }
          if (nameElements.length > 0) {
            name = nameElements[0].textContent?.trim() || "";
          }
          if (logoElements.length > 0) {
            logo = (logoElements[0] as HTMLImageElement).src || "";
          }

          // If symbol not found, try to extract from text
          if (!symbol) {
            // Look for all-caps text that looks like a symbol
            const words = rowText.split(/\s+/);
            for (const word of words) {
              if (/^[A-Z]{2,10}$/.test(word) && word !== "USD") {
                symbol = word;
                break;
              }
            }
          }

          // Amount (balance)
          let amount = 0;
          const amountElements = row.querySelectorAll(
            '[class*="amount"], [class*="balance"], [class*="quantity"]'
          );
          if (amountElements.length > 0) {
            const amountText = amountElements[0].textContent?.trim() || "";
            amount = parseAmount(amountText);
          }

          // Chain
          let chain = "";
          const chainElements = row.querySelectorAll(
            '[class*="chain"], [class*="Chain"], [class*="network"]'
          );
          if (chainElements.length > 0) {
            chain = chainElements[0].textContent?.trim() || "";
          }

          // Protocol (for DeFi positions)
          let protocol = "";
          const protocolElements = row.querySelectorAll(
            '[class*="protocol"], [class*="Protocol"], [class*="platform"]'
          );
          if (protocolElements.length > 0) {
            protocol = protocolElements[0].textContent?.trim() || "";
          }

          // Price
          let price = 0;
          const priceElements = row.querySelectorAll(
            '[class*="price"]:not([class*="PriceChange"])'
          );
          if (priceElements.length > 0) {
            const priceText = priceElements[0].textContent?.trim() || "";
            price = parseCurrency(priceText);
          }

          // Value (USD)
          let value = 0;
          const valueElements = row.querySelectorAll(
            '[class*="value"], [class*="usd"], [class*="worth"]'
          );

          // Find the element with the largest dollar value
          let maxValue = 0;
          valueElements.forEach((el) => {
            const text = el.textContent?.trim() || "";
            const val = parseCurrency(text);
            if (val > maxValue) {
              maxValue = val;
            }
          });
          value = maxValue;

          // Category detection
          let category: "wallet" | "defi" | "lending" | "reward" = "wallet";
          const rowTextLower = rowText.toLowerCase();
          if (
            rowTextLower.includes("staking") ||
            rowTextLower.includes("staked")
          ) {
            category = "defi";
          } else if (
            rowTextLower.includes("lending") ||
            rowTextLower.includes("supplied") ||
            rowTextLower.includes("deposit")
          ) {
            category = "lending";
          } else if (
            rowTextLower.includes("reward") ||
            rowTextLower.includes("claimable")
          ) {
            category = "reward";
          } else if (protocol) {
            category = "defi";
          }

          // Only add if we have minimum required data
          if (symbol && value > 0.01) {
            results.push({
              name: name || symbol,
              symbol: symbol,
              amount: amount || 0,
              price: price,
              value: value,
              chain: chain || "Unknown",
              category: category,
              protocol: protocol || undefined,
              logo: logo || undefined,
            });
            console.log(`[DeBank] Extracted: ${symbol} = $${value}`);
          }
        } catch (e) {
          console.error(`[DeBank] Error parsing row ${index}:`, e);
        }
      });

      // Fallback: if no structured data found, try to parse the entire page text
      if (results.length === 0) {
        console.log(
          "[DeBank] No structured tokens found, attempting text analysis fallback"
        );
        const pageText = document.body.innerText;
        const lines = pageText.split("\n");

        // Look for patterns like "ETH 1.234 $2,345.67"
        const tokenPattern = /([A-Z]{2,10})\s+([\d,.]+)\s+\$([0-9,.]+)/g;
        let match;
        while ((match = tokenPattern.exec(pageText)) !== null) {
          const symbol = match[1];
          const amount = parseAmount(match[2]);
          const value = parseCurrency(match[3]);

          if (value > 0.01 && symbol !== "USD") {
            results.push({
              name: symbol,
              symbol: symbol,
              amount: amount,
              price: amount > 0 ? value / amount : 0,
              value: value,
              chain: "Unknown",
              category: "wallet" as const,
            });
          }
        }
      }

      console.log(`[DeBank] Total tokens extracted: ${results.length}`);
      return results;
    });

    console.log(`[DeBank] ✅ Extraídos ${tokens.length} tokens`);
    await page.close();
    return tokens;
  } catch (error) {
    console.error("[DeBank] ❌ Erro na extração detalhada:", error);
    await page.close().catch(() => {});
    return [];
  }
}

async function extractDebankNetWorthEVM(page: Page): Promise<string | null> {
  console.log("[DeBank] Extracting Net Worth from DOM");
  try {
    const netWorth = await page.evaluate(() => {
      try {
        const pageText = document.body.innerText;
        const lines = pageText
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          const line = lines[i];
          const match = line.match(/^\$\s*([\d,]+(?:\.\d{2})?)\s+[-+][\d.]+%/);
          if (match) return match[1];
        }
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          const line = lines[i];
          if (line.startsWith("$")) {
            const match = line.match(/^\$\s*([\d,]+\.?\d*)/);
            if (match) {
              const value = match[1];
              const numValue = parseFloat(value.replace(/,/g, ""));
              if (numValue > 0 && numValue < 10000000) return value;
            }
          }
        }
        return null;
      } catch (error) {
        return null;
      }
    });
    return netWorth ? `$${netWorth}` : null;
  } catch (error) {
    return null;
  }
}

export async function scrapeDebankEVM(
  browser: Browser,
  walletLink: string
): Promise<ScraperResult> {
  if (!browser)
    return {
      value: null,
      success: false,
      platform: "debank",
      error: "Browser not available",
    };
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );
    await page.goto(walletLink, { waitUntil: "networkidle2", timeout: 50000 });
    await new Promise((resolve) => setTimeout(resolve, 20000));
    let value = await extractDebankNetWorthEVM(page);
    await page.close();
    if (value) return { value, success: true, platform: "debank" };
    return {
      value: null,
      success: false,
      platform: "debank",
      error: "Value not found",
    };
  } catch (error) {
    await page.close().catch(() => {});
    return {
      value: null,
      success: false,
      platform: "debank",
      error: String(error),
    };
  }
}

export async function selectAndScrapePlatform(
  browser: Browser | null,
  walletLink: string,
  walletName: string
): Promise<ScraperResult> {
  if (!browser)
    return {
      value: null,
      success: false,
      platform: "unknown",
      error: "Browser not available",
    };
  if (walletLink.includes("debank.com"))
    return await scrapeDebankEVM(browser, walletLink);
  return {
    value: null,
    success: false,
    platform: "unknown",
    error: "Unsupported platform",
  };
}
