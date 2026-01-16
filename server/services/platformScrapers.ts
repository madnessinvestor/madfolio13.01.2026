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

export async function fetchDetailedTokens(walletUrl: string, browser: Browser): Promise<any[]> {
  console.log("[DeBank] 🚀 Iniciando extração detalhada de tokens:", walletUrl);
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await page.goto(walletUrl, { waitUntil: "networkidle2", timeout: 60000 });
    
    console.log("[DeBank] ⏳ Aguardando renderização dos tokens...");
    await new Promise(resolve => setTimeout(resolve, 20000));

    const tokens = await page.evaluate(() => {
      const results: any[] = [];
      
      // DeBank uses complex class names, we search for common patterns
      const rows = document.querySelectorAll('.db-table-row, [class*="TokenList_row"], [class*="PortfolioTable_row"]');
      
      rows.forEach(row => {
        try {
          // Name/Symbol
          const nameEl = row.querySelector('[class*="TokenList_symbol"], [class*="Token_symbol"], .db-table-cell:first-child');
          // Balance
          const balanceEl = row.querySelector('[class*="TokenList_balance"], [class*="Token_balance"], .db-table-cell:nth-child(2)');
          // Value (USD)
          const valueEl = row.querySelector('[class*="TokenList_value"], [class*="Token_value"], .db-table-cell:last-child');
          
          if (nameEl && valueEl) {
            const name = nameEl.textContent?.trim() || "Unknown";
            const balanceStr = balanceEl?.textContent?.trim() || "0";
            const valueStr = valueEl.textContent?.trim() || "$0";
            
            const value = parseFloat(valueStr.replace(/[$,]/g, ''));
            const balance = parseFloat(balanceStr.replace(/,/g, ''));
            
            if (!isNaN(value) && value > 0) {
              results.push({
                name,
                symbol: name,
                balance,
                value,
                type: "wallet"
              });
            }
          }
        } catch (e) {
          console.error("Error parsing row:", e);
        }
      });
      
      // Fallback: If no rows found, try to look for anything that looks like a token entry
      if (results.length === 0) {
          console.log("No standard rows found, attempting fallback extraction");
          // This is a simplified fallback
      }
      
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
        const lines = pageText.split("\n").map(l => l.trim()).filter(l => l.length > 0);
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
      } catch (error) { return null; }
    });
    return netWorth ? `$${netWorth}` : null;
  } catch (error) { return null; }
}

export async function scrapeDebankEVM(browser: Browser, walletLink: string): Promise<ScraperResult> {
  if (!browser) return { value: null, success: false, platform: "debank", error: "Browser not available" };
  const page = await browser.newPage();
  try {
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    await page.goto(walletLink, { waitUntil: "networkidle2", timeout: 50000 });
    await new Promise(resolve => setTimeout(resolve, 20000));
    let value = await extractDebankNetWorthEVM(page);
    await page.close();
    if (value) return { value, success: true, platform: "debank" };
    return { value: null, success: false, platform: "debank", error: "Value not found" };
  } catch (error) {
    await page.close().catch(() => {});
    return { value: null, success: false, platform: "debank", error: String(error) };
  }
}

export async function selectAndScrapePlatform(browser: Browser | null, walletLink: string, walletName: string): Promise<ScraperResult> {
    if (!browser) return { value: null, success: false, platform: "unknown", error: "Browser not available" };
    if (walletLink.includes("debank.com")) return await scrapeDebankEVM(browser, walletLink);
    return { value: null, success: false, platform: "unknown", error: "Unsupported platform" };
}
