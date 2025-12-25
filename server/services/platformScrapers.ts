// Platform-specific wallet balance scrapers with timeout & fallback logic
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import Tesseract from "tesseract.js";
import sharp from "sharp";

puppeteerExtra.use(StealthPlugin());

export interface ScraperResult {
  value: string | null;
  success: boolean;
  platform: string;
  error?: string;
}

// ============================================================================
// HELPER: Extract largest dollar value from text (opportunistic strategy)
// ============================================================================

function extractLargestDollarValue(text: string): string | null {
  const regex = /\$[\d,]+(?:\.\d{2})?/g;
  const matches = text.match(regex);

  if (!matches || matches.length === 0) return null;

  const values = matches
    .map((m) => ({
      str: m,
      num: parseFloat(m.replace(/[$,]/g, "")),
    }))
    .filter((v) => v.num >= 10); // Ignore values < $10

  if (values.length === 0) return null;

  const maxValue = values.reduce((a, b) => (a.num > b.num ? a : b));
  return maxValue.str;
}

// ============================================================================
// EVM / DEBANK SCRAPER (KEEP AS IS - DO NOT MODIFY)
// ============================================================================

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

        // Look for pattern: $X,XXX -Y.YY% or $X +Y.YY% (portfolio total with % change)
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          const line = lines[i];
          const match = line.match(/^\$\s*([\d,]+(?:\.\d{2})?)\s+[-+][\d.]+%/);
          if (match) {
            const value = match[1];
            console.log("[DeBank] Found top-right portfolio value: " + value);
            return value;
          }
        }

        // Fallback: Look for first $ value on a line by itself
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          const line = lines[i];
          if (line.startsWith("$")) {
            const match = line.match(/^\$\s*([\d,]+\.?\d*)/);
            if (match) {
              const value = match[1];
              const numValue = parseFloat(value.replace(/,/g, ""));
              if (numValue > 0 && numValue < 10000000) {
                console.log("[DeBank] Fallback - found value: " + value);
                return value;
              }
            }
          }
        }

        return null;
      } catch (error) {
        console.log("[DeBank] Extraction error: " + error);
        return null;
      }
    });

    return netWorth ? `$${netWorth}` : null;
  } catch (error) {
    console.error("[DeBank] Error:", error);
    return null;
  }
}

export async function scrapeDebankEVM(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 180000
): Promise<ScraperResult> {
  console.log("[DeBank] 🚀 Iniciando scrape DOM direto:", walletLink);

  if (!browser) {
    return {
      value: null,
      success: false,
      platform: "debank",
      error: "Browser não disponível",
    };
  }

  const page = await browser.newPage();

  try {
    console.log("[DeBank] Starting EVM DOM scraper (API desabilitada)");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // DOM scraping direto (SEM API)
    console.log("[DeBank] 🌐 Navegando para página principal...");
    await page
      .goto(walletLink, { waitUntil: "networkidle2", timeout: 50000 })
      .catch((e) => console.log("[DeBank] Navigation warning: " + e.message));

    // Wait for JavaScript to render (20 seconds for better loading)
    console.log("[DeBank] ⏳ Aguardando 20s para renderização completa...");
    await new Promise(resolve => setTimeout(resolve, 20000));

    // Try multiple times with increasing wait times to ensure content is loaded
    let value = null;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts && !value; attempt++) {
      console.log(
        `[DeBank] 🔍 Tentativa de extração ${attempt}/${maxAttempts}`
      );

      // Progressive wait: apenas retry se falhar
      if (attempt > 1) {
        const waitTime = 3000 + attempt * 3000;
        console.log(
          `[DeBank] ⏳ Aguardando ${waitTime}ms antes da próxima tentativa...`
        );
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      value = await extractDebankNetWorthEVM(page);
      console.log(
        `[DeBank] 📊 Tentativa ${attempt} retornou:`,
        value || "null"
      );

      if (value) {
        console.log(`[DeBank] ✅ Sucesso na tentativa ${attempt}: ${value}`);
        break;
      } else if (attempt < maxAttempts) {
        console.log(`[DeBank] ❌ Tentativa ${attempt} falhou, retrying...`);
      }
    }

    await page.close();

    if (value) {
      console.log("[DeBank] ✅ Extração completa:", value);
      return { value, success: true, platform: "debank" };
    }

    console.log(
      "[DeBank] ❌ Valor não encontrado após",
      maxAttempts,
      "tentativas"
    );
    return {
      value: null,
      success: false,
      platform: "debank",
      error: "Valor não encontrado no DOM",
    };
  } catch (error) {
    await page.close().catch(() => {});
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[DeBank] ❌ Erro fatal:", msg);
    return { value: null, success: false, platform: "debank", error: msg };
  }
}

// ============================================================================
// HELPER: Normalize European format currency for Jupiter ($1.911,36 → 1911.36)
// ============================================================================

function normalizeJupiterValue(rawValue: string): string {
  console.log("[JupiterPortfolio] Raw value before normalization: " + rawValue);

  // Remove $ and whitespace
  let normalized = rawValue.replace(/[\$\s]/g, "");
  console.log("[JupiterPortfolio] After removing $: " + normalized);

  // Remove dots (European thousand separator)
  normalized = normalized.replace(/\./g, "");
  console.log("[JupiterPortfolio] After removing dots: " + normalized);

  // Replace comma with dot (European decimal separator → standard decimal)
  normalized = normalized.replace(/,/g, ".");
  console.log("[JupiterPortfolio] After replacing comma: " + normalized);

  return normalized;
}

// ============================================================================
// JUPITER PORTFOLIO SCRAPER (jup.ag/portfolio - Net Worth Specific)
// ============================================================================

async function scrapeJupiterPortfolioNetWorth(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 60000
): Promise<ScraperResult> {
  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);

  try {
    console.log(
      "[JupiterPortfolio] Starting OCR scraper anchored to Net Worth"
    );

    // Set viewport
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // Navigate
    console.log("[JupiterPortfolio] Navigating to wallet...");
    await page
      .goto(walletLink, { waitUntil: "domcontentloaded", timeout: 50000 })
      .catch((e) =>
        console.log("[JupiterPortfolio] Navigation warning: " + e.message)
      );

    // Wait for full rendering (up to 15 seconds for complete page load)
    console.log("[JupiterPortfolio] Waiting up to 15 seconds for rendering...");
    await new Promise((resolve) => setTimeout(resolve, 15000));

    let netWorthValue: string | null = null;
    let retryCount = 0;

    // Retry loop: try OCR up to 2 times
    while (!netWorthValue && retryCount < 2) {
      retryCount++;
      console.log("[JupiterPortfolio] OCR attempt " + retryCount);

      // Step 1: Full page screenshot + OCR to find "Net Worth" position
      console.log("[JupiterPortfolio] Taking full page screenshot...");
      const fullScreenshot = await page.screenshot();

      console.log(
        "[JupiterPortfolio] Running OCR on full page to locate Net Worth..."
      );
      const fullOcrResult = await Tesseract.recognize(fullScreenshot, "eng", {
        logger: (m) => {
          if (m.status === "recognizing text" && m.progress % 0.2 === 0) {
            console.log(
              "[JupiterPortfolio] OCR progress: " +
                Math.round(m.progress * 100) +
                "%"
            );
          }
        },
      });

      const fullText = fullOcrResult.data.text;
      const netWorthIndex = fullText.indexOf("Net Worth");

      if (netWorthIndex === -1) {
        console.log('[JupiterPortfolio] "Net Worth" not found in OCR');
        if (retryCount < 2) {
          console.log("[JupiterPortfolio] Retrying after 3 seconds...");
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        continue;
      }

      console.log(
        '[JupiterPortfolio] Found "Net Worth" in OCR at position ' +
          netWorthIndex
      );

      // Step 2: Find bounding box of "Net Worth" text in full page
      const netWorthBounds = await page.evaluate((searchText: string) => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let node;
        while ((node = walker.nextNode())) {
          if (node.textContent && node.textContent.includes(searchText)) {
            const parent = node.parentElement;
            if (parent) {
              const rect = parent.getBoundingClientRect();
              return {
                x: Math.max(0, rect.x),
                y: Math.max(0, rect.y),
                width: rect.width,
                height: rect.height,
              };
            }
          }
        }
        return null;
      }, "Net Worth");

      if (!netWorthBounds) {
        console.log(
          "[JupiterPortfolio] Could not find Net Worth bounds in DOM"
        );
        if (retryCount < 2) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        continue;
      }

      console.log(
        "[JupiterPortfolio] Net Worth bounds: " + JSON.stringify(netWorthBounds)
      );

      // Step 3: Recrop region BELOW "Net Worth" (40-120px offset)
      const regionBelowNetWorth = {
        x: Math.max(0, netWorthBounds.x - 50),
        y: Math.max(0, netWorthBounds.y + netWorthBounds.height + 40), // 40px below
        width: Math.min(netWorthBounds.width + 100, 600),
        height: 80, // Small height to capture just the value
      };

      console.log(
        "[JupiterPortfolio] Cropping region below Net Worth: " +
          JSON.stringify(regionBelowNetWorth)
      );

      // Step 4: Screenshot of cropped region
      const croppedScreenshot = await page.screenshot({
        clip: regionBelowNetWorth,
      });

      // Step 5: OCR on cropped region
      console.log(
        "[JupiterPortfolio] Running OCR on cropped Net Worth region..."
      );
      const croppedOcrResult = await Tesseract.recognize(
        croppedScreenshot,
        "eng",
        {
          logger: (m) => {
            if (m.status === "recognizing text") {
              console.log(
                "[JupiterPortfolio] Cropped OCR progress: " +
                  Math.round(m.progress * 100) +
                  "%"
              );
            }
          },
        }
      );

      const croppedText = croppedOcrResult.data.text;
      console.log(
        "[JupiterPortfolio] Cropped OCR text: [" +
          croppedText.replace(/\n/g, " | ") +
          "]"
      );

      // Step 6: Extract first valid dollar value >= $50
      const dollarPattern = /\$\s?\d{1,3}(\.\d{3})*,\d{2}/g;
      const matches = croppedText.match(dollarPattern) || [];

      console.log(
        "[JupiterPortfolio] Found " +
          matches.length +
          " dollar values in cropped region"
      );

      for (const match of matches) {
        let cleaned = match.replace(/[\$\s]/g, "");
        cleaned = cleaned.replace(/\./g, "").replace(/,/g, ".");
        const numValue = parseFloat(cleaned);

        console.log(
          "[JupiterPortfolio]   Value: " + match + " → $" + numValue.toFixed(2)
        );

        // Validation: must be >= $50
        if (numValue >= 50) {
          netWorthValue = numValue.toFixed(2);
          console.log(
            "[JupiterPortfolio] VALID Net Worth found: $" + netWorthValue
          );
          break;
        } else {
          console.log("[JupiterPortfolio]   Rejected (< $50)");
        }
      }

      if (!netWorthValue && retryCount < 2) {
        console.log(
          "[JupiterPortfolio] No valid value found, retrying after 3 seconds..."
        );
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    if (!netWorthValue) {
      console.log(
        "[JupiterPortfolio] Failed to extract Net Worth after retries"
      );
      return {
        value: null,
        success: false,
        platform: "jupiter",
        error: "Net Worth extraction failed",
      };
    }

    console.log("[JupiterPortfolio] SUCCESS - Net Worth: $" + netWorthValue);
    return { value: "$" + netWorthValue, success: true, platform: "jupiter" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[JupiterPortfolio] Error:", msg);
    return { value: null, success: false, platform: "jupiter", error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// SOLANA / JUPITER SCRAPER (Opportunistic - Largest Value Strategy)
// ============================================================================

export async function scrapeJupiterSolana(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 45000
): Promise<ScraperResult> {
  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);

  try {
    console.log("[Jupiter] Starting Solana scraper (opportunistic)");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // Navigate and wait for initial load
    await page
      .goto(walletLink, { waitUntil: "networkidle2", timeout: 50000 })
      .catch((e) => console.log("[Jupiter] Navigation warning: " + e.message));

    // Try multiple times with progressive wait to ensure content is loaded
    let value = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts && !value; attempt++) {
      console.log(`[Jupiter] Extraction attempt ${attempt}/${maxAttempts}`);

      // Progressive wait: 8s, 12s, 18s
      const waitTime = 5000 + attempt * 5000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Extract ALL text and find largest value
      value = await page.evaluate(() => {
        const fullText = document.body.innerText;
        const regex = /\$[\d,]+(?:\.\d{2})?/g;
        const matches = fullText.match(regex);

        if (!matches || matches.length === 0) return null;

        const values = matches
          .map((m) => ({
            str: m,
            num: parseFloat(m.replace(/[$,]/g, "")),
          }))
          .filter((v) => v.num >= 10); // Ignore < $10

        if (values.length === 0) return null;

        const maxValue = values.reduce((a, b) => (a.num > b.num ? a : b));
        return maxValue.str;
      });

      if (value) {
        console.log(
          `[Jupiter] Extracted largest value on attempt ${attempt}: ${value}`
        );
        break;
      } else if (attempt < maxAttempts) {
        console.log(
          `[Jupiter] No value found on attempt ${attempt}, retrying...`
        );
      }
    }

    if (value) {
      return { value, success: true, platform: "jupiter" };
    }

    return {
      value: null,
      success: false,
      platform: "jupiter",
      error: "No portfolio value found after multiple attempts",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Jupiter] Error:", msg);
    return { value: null, success: false, platform: "jupiter", error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// STARKNET / READY SCRAPER (Opportunistic - Largest Value Strategy)
// ============================================================================

export async function scrapeReadyStarknet(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 45000
): Promise<ScraperResult> {
  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);

  try {
    console.log("[Ready] Starting Starknet scraper (opportunistic)");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // Navigate and wait for initial load
    await page
      .goto(walletLink, { waitUntil: "networkidle2", timeout: 50000 })
      .catch((e) => console.log("[Ready] Navigation warning: " + e.message));

    // Try multiple times with progressive wait to ensure content is loaded
    let value = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts && !value; attempt++) {
      console.log(`[Ready] Extraction attempt ${attempt}/${maxAttempts}`);

      // Progressive wait: 8s, 12s, 18s
      const waitTime = 5000 + attempt * 5000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Extract ALL text and find largest value
      value = await page.evaluate(() => {
        const fullText = document.body.innerText;
        const regex = /\$[\d,]+(?:\.\d{2})?/g;
        const matches = fullText.match(regex);

        if (!matches || matches.length === 0) return null;

        const values = matches
          .map((m) => ({
            str: m,
            num: parseFloat(m.replace(/[$,]/g, "")),
          }))
          .filter((v) => v.num >= 10); // Ignore < $10

        if (values.length === 0) return null;

        const maxValue = values.reduce((a, b) => (a.num > b.num ? a : b));
        return maxValue.str;
      });

      if (value) {
        console.log(
          `[Ready] Extracted largest value on attempt ${attempt}: ${value}`
        );
        break;
      } else if (attempt < maxAttempts) {
        console.log(
          `[Ready] No value found on attempt ${attempt}, retrying...`
        );
      }
    }

    if (value) {
      return { value, success: true, platform: "ready" };
    }

    return {
      value: null,
      success: false,
      platform: "ready",
      error: "No portfolio value found after multiple attempts",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Ready] Error:", msg);
    return { value: null, success: false, platform: "ready", error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// APTOS / APTOSCAN SCRAPER (Specific - Value below COIN VALUE)
// ============================================================================

export async function scrapeAptoscanAptos(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 30000
): Promise<ScraperResult> {
  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);

  try {
    console.log("[Aptoscan] Starting Aptos scraper (specific COIN VALUE)");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // Navigate and wait for initial load
    await page
      .goto(walletLink, { waitUntil: "networkidle2", timeout: 45000 })
      .catch((e) => console.log("[Aptoscan] Navigation warning: " + e.message));

    // Try multiple times with progressive wait to ensure content is loaded
    let value = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts && !value; attempt++) {
      console.log(`[Aptoscan] Extraction attempt ${attempt}/${maxAttempts}`);

      // Progressive wait: 8s, 12s, 18s
      const waitTime = 5000 + attempt * 5000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Extract value below "COIN VALUE"
      value = await page.evaluate(() => {
        const fullText = document.body.innerText;
        const lines = fullText
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.toUpperCase().includes("COIN VALUE")) {
            console.log(
              "[Aptoscan] Found COIN VALUE at line " + i + ": " + line
            );

            // Look at the next few lines for a dollar value
            for (let j = 1; j <= 5 && i + j < lines.length; j++) {
              const nextLine = lines[i + j];
              console.log(
                "[Aptoscan] Checking line " + (i + j) + ": " + nextLine
              );

              // Look for dollar value in this line
              const dollarMatch = nextLine.match(/\$[\d,]+(?:\.\d{2})?/);
              if (dollarMatch) {
                const extractedValue = dollarMatch[0];
                const numValue = parseFloat(
                  extractedValue.replace(/[$,]/g, "")
                );
                if (numValue > 0) {
                  console.log(
                    "[Aptoscan] Found value below COIN VALUE: " + extractedValue
                  );
                  return extractedValue;
                }
              }
            }
          }
        }

        // Fallback: Extract ALL text and find largest value
        console.log(
          "[Aptoscan] COIN VALUE not found, falling back to largest value strategy"
        );
        const regex = /\$[\d,]+(?:\.\d{2})?/g;
        const matches = fullText.match(regex);

        if (!matches || matches.length === 0) return null;

        const values = matches
          .map((m) => ({
            str: m,
            num: parseFloat(m.replace(/[$,]/g, "")),
          }))
          .filter((v) => v.num >= 10); // Ignore < $10

        if (values.length === 0) return null;

        const maxValue = values.reduce((a, b) => (a.num > b.num ? a : b));
        return maxValue.str;
      });

      if (value) {
        console.log(
          `[Aptoscan] Extracted value on attempt ${attempt}: ${value}`
        );
        break;
      } else if (attempt < maxAttempts) {
        console.log(
          `[Aptoscan] No value found on attempt ${attempt}, retrying...`
        );
      }
    }

    if (value) {
      return { value, success: true, platform: "aptoscan" };
    }

    return {
      value: null,
      success: false,
      platform: "aptoscan",
      error: "No portfolio value found after multiple attempts",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Aptoscan] Error:", msg);
    return { value: null, success: false, platform: "aptoscan", error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// SEI / SEISCAN SCRAPER (Specific - Value below SEI VALUE)
// ============================================================================

export async function scrapeSeiscanSei(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 30000
): Promise<ScraperResult> {
  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);

  try {
    console.log("[Seiscan] Starting Sei scraper (specific SEI VALUE)");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // Navigate and wait for initial load
    await page
      .goto(walletLink, { waitUntil: "networkidle2", timeout: 45000 })
      .catch((e) => console.log("[Seiscan] Navigation warning: " + e.message));

    // Try multiple times with progressive wait to ensure content is loaded
    let value = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts && !value; attempt++) {
      console.log(`[Seiscan] Extraction attempt ${attempt}/${maxAttempts}`);

      // Progressive wait: 8s, 12s, 18s
      const waitTime = 5000 + attempt * 5000;
      await new Promise((resolve) => setTimeout(resolve, waitTime));

      // Extract value below "SEI VALUE"
      value = await page.evaluate(() => {
        const fullText = document.body.innerText;
        const lines = fullText
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.length > 0);

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.toUpperCase().includes("SEI VALUE")) {
            console.log("[Seiscan] Found SEI VALUE at line " + i + ": " + line);

            // Look at the next few lines for a dollar value
            for (let j = 1; j <= 5 && i + j < lines.length; j++) {
              const nextLine = lines[i + j];
              console.log(
                "[Seiscan] Checking line " + (i + j) + ": " + nextLine
              );

              // Look for dollar value in this line
              const dollarMatch = nextLine.match(/\$[\d,]+(?:\.\d{2})?/);
              if (dollarMatch) {
                const extractedValue = dollarMatch[0];
                const numValue = parseFloat(
                  extractedValue.replace(/[$,]/g, "")
                );
                if (numValue > 0) {
                  console.log(
                    "[Seiscan] Found value below SEI VALUE: " + extractedValue
                  );
                  return extractedValue;
                }
              }
            }
          }
        }

        // Fallback: Extract ALL text and find largest value
        console.log(
          "[Seiscan] SEI VALUE not found, falling back to largest value strategy"
        );
        const regex = /\$[\d,]+(?:\.\d{2})?/g;
        const matches = fullText.match(regex);

        if (!matches || matches.length === 0) return null;

        const values = matches
          .map((m) => ({
            str: m,
            num: parseFloat(m.replace(/[$,]/g, "")),
          }))
          .filter((v) => v.num >= 10); // Ignore < $10

        if (values.length === 0) return null;

        const maxValue = values.reduce((a, b) => (a.num > b.num ? a : b));
        return maxValue.str;
      });

      if (value) {
        console.log(
          `[Seiscan] Extracted value on attempt ${attempt}: ${value}`
        );
        break;
      } else if (attempt < maxAttempts) {
        console.log(
          `[Seiscan] No value found on attempt ${attempt}, retrying...`
        );
      }
    }

    if (value) {
      return { value, success: true, platform: "seiscan" };
    }

    return {
      value: null,
      success: false,
      platform: "seiscan",
      error: "No portfolio value found after multiple attempts",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Seiscan] Error:", msg);
    return { value: null, success: false, platform: "seiscan", error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// GENERIC OPPORTUNISTIC SCRAPER (Fallback for all platforms)
// ============================================================================

export async function scrapeGenericOpportunistic(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 30000
): Promise<ScraperResult> {
  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);

  try {
    console.log("[Generic] Starting opportunistic DOM scraper");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    );

    // Navigate and wait for initial load
    await page
      .goto(walletLink, {
        waitUntil: "domcontentloaded",
        timeout: timeoutMs - 5000,
      })
      .catch((e) => console.log("[Generic] Navigation warning: " + e.message));

    // Quick wait for rendering
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Extract ALL text and find largest value
    const value = await page.evaluate(() => {
      const fullText = document.body.innerText;
      const regex = /\$[\d,]+(?:\.\d{2})?/g;
      const matches = fullText.match(regex);

      if (!matches || matches.length === 0) return null;

      const values = matches
        .map((m) => ({
          str: m,
          num: parseFloat(m.replace(/[$,]/g, "")),
        }))
        .filter((v) => v.num >= 10); // Ignore < $10

      if (values.length === 0) return null;

      const maxValue = values.reduce((a, b) => (a.num > b.num ? a : b));
      return maxValue.str;
    });

    if (value) {
      console.log("[Generic] Extracted largest value: " + value);
      return { value, success: true, platform: "generic" };
    }

    return {
      value: null,
      success: false,
      platform: "generic",
      error: "No portfolio value found",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Generic] Error:", msg);
    return { value: null, success: false, platform: "generic", error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// SELECTOR FUNCTION (Always returns functional scraper, NEVER null)
// ============================================================================

export async function selectAndScrapePlatform(
  browser: Browser | null,
  walletLink: string,
  walletName: string
): Promise<ScraperResult> {
  console.log(
    `[Platform] Selecting scraper for: ${walletName} (${walletLink})`
  );

  // Wrapper com timeout de segurança para garantir que sempre resolva
  return Promise.race([
    (async () => {
      try {
        // ==================== DEBANK (Special case - fixed)
        if (walletLink.includes("debank.com")) {
          if (!browser) {
            return {
              value: null,
              success: false,
              platform: "debank",
              error: "Browser not available",
            };
          }
          return await scrapeDebankEVM(browser, walletLink, 120000);
        }

        // ==================== RECOGNIZED PLATFORMS (with specific timeouts)
        // SPECIAL CASE: jup.ag/portfolio - Use Net Worth specific scraper
        if (walletLink.includes("jup.ag/portfolio")) {
          if (!browser)
            return {
              value: null,
              success: false,
              platform: "jupiter",
              error: "Browser not available",
            };
          console.log(
            "[Platform] Jupiter Portfolio detected - using Net Worth specific scraper"
          );
          return await scrapeJupiterPortfolioNetWorth(
            browser,
            walletLink,
            30000
          );
        }

        // Generic Jupiter scraper for other jup.ag links
        if (walletLink.includes("jup.ag")) {
          if (!browser)
            return {
              value: null,
              success: false,
              platform: "jupiter",
              error: "Browser not available",
            };
          return await scrapeJupiterSolana(browser, walletLink, 45000);
        }

        if (walletLink.includes("portfolio.ready.co")) {
          if (!browser)
            return {
              value: null,
              success: false,
              platform: "ready",
              error: "Browser not available",
            };
          return await scrapeReadyStarknet(browser, walletLink, 45000);
        }

        if (walletLink.includes("aptoscan.com")) {
          if (!browser)
            return {
              value: null,
              success: false,
              platform: "aptoscan",
              error: "Browser not available",
            };
          return await scrapeAptoscanAptos(browser, walletLink, 30000);
        }

        if (walletLink.includes("seiscan.io")) {
          if (!browser)
            return {
              value: null,
              success: false,
              platform: "seiscan",
              error: "Browser not available",
            };
          return await scrapeSeiscanSei(browser, walletLink, 30000);
        }

        // ==================== FALLBACK: Generic opportunistic scraper for ANY other platform
        console.log(
          `[Platform] Platform not recognized, using generic opportunistic scraper`
        );
        if (!browser) {
          return {
            value: null,
            success: false,
            platform: "generic",
            error: "Browser not available",
          };
        }
        return await scrapeGenericOpportunistic(browser, walletLink, 30000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Platform] Unhandled error:`, msg);
        return { value: null, success: false, platform: "generic", error: msg };
      }
    })(),
    // Timeout de segurança: se após 70 segundos não resolveu, força retorno
    new Promise<ScraperResult>((resolve) => {
      setTimeout(() => {
        console.error(`[Platform] Safety timeout reached for ${walletName}`);
        resolve({
          value: null,
          success: false,
          platform: "timeout",
          error: "Safety timeout reached",
        });
      }, 70000);
    }),
  ]);
}
