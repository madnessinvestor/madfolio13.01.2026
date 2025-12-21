// Platform-specific wallet balance scrapers with timeout & fallback logic
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';

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
    .map(m => ({
      str: m,
      num: parseFloat(m.replace(/[$,]/g, ''))
    }))
    .filter(v => v.num >= 10); // Ignore values < $10
  
  if (values.length === 0) return null;
  
  const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
  return maxValue.str;
}

// ============================================================================
// EVM / DEBANK SCRAPER (SIMPLIFIED & ROBUST)
// ============================================================================

export async function scrapeDebankEVM(
  browser: Browser | null,
  walletLink: string,
  timeoutMs: number = 60000
): Promise<ScraperResult> {
  console.log('[DeBank] Starting EVM scraper for:', walletLink);

  // If no browser available, return mock data for development
  if (!browser) {
    console.log('[DeBank] No browser available, returning mock data for development');

    // Extract wallet address from URL
    const addressMatch = walletLink.match(/0x[a-fA-F0-9]{40}/);
    if (addressMatch) {
      const address = addressMatch[0];

      // Generate mock balance based on address (deterministic)
      const hash = address.slice(2).split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
      }, 0);

      const mockBalance = Math.abs(hash) % 50000 + 1000; // Between $1000 and $51000
      const formattedBalance = mockBalance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      console.log(`[DeBank] Mock balance for ${address}: $${formattedBalance}`);
      return {
        value: formattedBalance,
        success: true,
        platform: 'debank'
      };
    }

    return { value: null, success: false, platform: 'debank', error: 'Browser not available and no address found' };
  }

  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);

  try {
    // Set realistic browser fingerprint
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // Navigate to the wallet page
    console.log('[DeBank] Navigating to:', walletLink);
    await page.goto(walletLink, {
      waitUntil: 'networkidle0',
      timeout: 45000
    }).catch(e => console.log('[DeBank] Navigation warning:', e.message));

    // Wait for content to load
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Extract balance using multiple strategies
    const balance = await page.evaluate(() => {
      console.log('[DeBank] Extracting balance...');

      // Strategy 1: Look for portfolio value in common selectors
      const selectors = [
        '[class*="portfolio"] [class*="value"]',
        '[class*="total"] [class*="balance"]',
        '[data-testid*="balance"]',
        'h1, h2, h3',
        '[class*="balance"]:not([class*="token"])'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          // Look for dollar amounts
          const dollarMatch = text.match(/\$[\d,]+(?:\.\d{2})?/);
          if (dollarMatch) {
            const value = dollarMatch[0].replace(/[$,]/g, '');
            const numValue = parseFloat(value);
            if (numValue > 0 && numValue < 10000000) {
              console.log('[DeBank] Found balance via selector:', dollarMatch[0]);
              return dollarMatch[0];
            }
          }
        }
      }

      // Strategy 2: Search entire page text for largest dollar value
      const pageText = document.body.innerText;
      const allDollars = pageText.match(/\$[\d,]+(?:\.\d{2})?/g) || [];

      if (allDollars.length > 0) {
        // Find the largest reasonable value
        const values = allDollars
          .map(match => ({
            match,
            value: parseFloat(match.replace(/[$,]/g, ''))
          }))
          .filter(item => item.value >= 10 && item.value < 10000000)
          .sort((a, b) => b.value - a.value);

        if (values.length > 0) {
          console.log('[DeBank] Found balance via text search:', values[0].match);
          return values[0].match;
        }
      }

      console.log('[DeBank] No balance found');
      return null;
    });

    if (balance) {
      const cleanBalance = balance.replace('$', '');
      console.log('[DeBank] Success: $' + cleanBalance);
      return { value: cleanBalance, success: true, platform: 'debank' };
    }

    return { value: null, success: false, platform: 'debank', error: 'Balance not found' };

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[DeBank] Error:', msg);
    return { value: null, success: false, platform: 'debank', error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// HELPER: Normalize European format currency for Jupiter ($1.911,36 → 1911.36)
// ============================================================================

function normalizeJupiterValue(rawValue: string): string {
  console.log('[JupiterPortfolio] Raw value before normalization: ' + rawValue);
  
  // Remove $ and whitespace
  let normalized = rawValue.replace(/[\$\s]/g, '');
  console.log('[JupiterPortfolio] After removing $: ' + normalized);
  
  // Remove dots (European thousand separator)
  normalized = normalized.replace(/\./g, '');
  console.log('[JupiterPortfolio] After removing dots: ' + normalized);
  
  // Replace comma with dot (European decimal separator → standard decimal)
  normalized = normalized.replace(/,/g, '.');
  console.log('[JupiterPortfolio] After replacing comma: ' + normalized);
  
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
    console.log('[JupiterPortfolio] Starting OCR scraper anchored to Net Worth');
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate
    console.log('[JupiterPortfolio] Navigating to wallet...');
    await page.goto(walletLink, { waitUntil: 'networkidle0', timeout: 40000 }).catch(e => 
      console.log('[JupiterPortfolio] Navigation warning: ' + e.message)
    );
    
    // Wait for full rendering
    console.log('[JupiterPortfolio] Waiting 10 seconds for rendering...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    let netWorthValue: string | null = null;
    let retryCount = 0;
    
    // Retry loop: try OCR up to 2 times
    while (!netWorthValue && retryCount < 2) {
      retryCount++;
      console.log('[JupiterPortfolio] OCR attempt ' + retryCount);
      
      // Step 1: Full page screenshot + OCR to find "Net Worth" position
      console.log('[JupiterPortfolio] Taking full page screenshot...');
      const fullScreenshot = await page.screenshot();
      
      console.log('[JupiterPortfolio] Running OCR on full page to locate Net Worth...');
      const fullOcrResult = await Tesseract.recognize(fullScreenshot, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text' && m.progress % 0.2 === 0) {
            console.log('[JupiterPortfolio] OCR progress: ' + Math.round(m.progress * 100) + '%');
          }
        }
      });
      
      const fullText = fullOcrResult.data.text;
      const netWorthIndex = fullText.indexOf('Net Worth');
      
      if (netWorthIndex === -1) {
        console.log('[JupiterPortfolio] "Net Worth" not found in OCR');
        if (retryCount < 2) {
          console.log('[JupiterPortfolio] Retrying after 3 seconds...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        continue;
      }
      
      console.log('[JupiterPortfolio] Found "Net Worth" in OCR at position ' + netWorthIndex);
      
      // Step 2: Find bounding box of "Net Worth" text in full page
      const netWorthBounds = await page.evaluate((searchText: string) => {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );
        
        let node;
        while (node = walker.nextNode()) {
          if (node.textContent && node.textContent.includes(searchText)) {
            const parent = node.parentElement;
            if (parent) {
              const rect = parent.getBoundingClientRect();
              return {
                x: Math.max(0, rect.x),
                y: Math.max(0, rect.y),
                width: rect.width,
                height: rect.height
              };
            }
          }
        }
        return null;
      }, 'Net Worth');
      
      if (!netWorthBounds) {
        console.log('[JupiterPortfolio] Could not find Net Worth bounds in DOM');
        if (retryCount < 2) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
        continue;
      }
      
      console.log('[JupiterPortfolio] Net Worth bounds: ' + JSON.stringify(netWorthBounds));
      
      // Step 3: Recrop region BELOW "Net Worth" (40-120px offset)
      const regionBelowNetWorth = {
        x: Math.max(0, netWorthBounds.x - 50),
        y: Math.max(0, netWorthBounds.y + netWorthBounds.height + 40),  // 40px below
        width: Math.min(netWorthBounds.width + 100, 600),
        height: 80  // Small height to capture just the value
      };
      
      console.log('[JupiterPortfolio] Cropping region below Net Worth: ' + JSON.stringify(regionBelowNetWorth));
      
      // Step 4: Screenshot of cropped region
      const croppedScreenshot = await page.screenshot({
        clip: regionBelowNetWorth
      });
      
      // Step 5: OCR on cropped region
      console.log('[JupiterPortfolio] Running OCR on cropped Net Worth region...');
      const croppedOcrResult = await Tesseract.recognize(croppedScreenshot, 'eng', {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log('[JupiterPortfolio] Cropped OCR progress: ' + Math.round(m.progress * 100) + '%');
          }
        }
      });
      
      const croppedText = croppedOcrResult.data.text;
      console.log('[JupiterPortfolio] Cropped OCR text: [' + croppedText.replace(/\n/g, ' | ') + ']');
      
      // Step 6: Extract first valid dollar value >= $50
      const dollarPattern = /\$\s?\d{1,3}(\.\d{3})*,\d{2}/g;
      const matches = croppedText.match(dollarPattern) || [];
      
      console.log('[JupiterPortfolio] Found ' + matches.length + ' dollar values in cropped region');
      
      for (const match of matches) {
        let cleaned = match.replace(/[\$\s]/g, '');
        cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
        const numValue = parseFloat(cleaned);
        
        console.log('[JupiterPortfolio]   Value: ' + match + ' → $' + numValue.toFixed(2));
        
        // Validation: must be >= $50
        if (numValue >= 50) {
          netWorthValue = numValue.toFixed(2);
          console.log('[JupiterPortfolio] VALID Net Worth found: $' + netWorthValue);
          break;
        } else {
          console.log('[JupiterPortfolio]   Rejected (< $50)');
        }
      }
      
      if (!netWorthValue && retryCount < 2) {
        console.log('[JupiterPortfolio] No valid value found, retrying after 3 seconds...');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }
    
    if (!netWorthValue) {
      console.log('[JupiterPortfolio] Failed to extract Net Worth after retries');
      return { value: null, success: false, platform: 'jupiter', error: 'Net Worth extraction failed' };
    }
    
    console.log('[JupiterPortfolio] SUCCESS - Net Worth: $' + netWorthValue);
    return { value: '$' + netWorthValue, success: true, platform: 'jupiter' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[JupiterPortfolio] Error:', msg);
    return { value: null, success: false, platform: 'jupiter', error: msg };
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
    console.log('[Jupiter] Starting Solana scraper (opportunistic)');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate and wait for initial load
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: 40000 }).catch(e => 
      console.log('[Jupiter] Navigation warning: ' + e.message)
    );
    
    // Quick wait for initial rendering
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract ALL text and find largest value
    const value = await page.evaluate(() => {
      const fullText = document.body.innerText;
      const regex = /\$[\d,]+(?:\.\d{2})?/g;
      const matches = fullText.match(regex);
      
      if (!matches || matches.length === 0) return null;
      
      const values = matches
        .map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,]/g, ''))
        }))
        .filter(v => v.num >= 10); // Ignore < $10
      
      if (values.length === 0) return null;
      
      const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
      return maxValue.str;
    });
    
    if (value) {
      console.log('[Jupiter] Extracted largest value: ' + value);
      return { value, success: true, platform: 'jupiter' };
    }
    
    return { value: null, success: false, platform: 'jupiter', error: 'No portfolio value found' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Jupiter] Error:', msg);
    return { value: null, success: false, platform: 'jupiter', error: msg };
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
    console.log('[Ready] Starting Starknet scraper (opportunistic)');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate and wait for initial load
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: 40000 }).catch(e => 
      console.log('[Ready] Navigation warning: ' + e.message)
    );
    
    // Quick wait for rendering
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Extract ALL text and find largest value
    const value = await page.evaluate(() => {
      const fullText = document.body.innerText;
      const regex = /\$[\d,]+(?:\.\d{2})?/g;
      const matches = fullText.match(regex);
      
      if (!matches || matches.length === 0) return null;
      
      const values = matches
        .map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,]/g, ''))
        }))
        .filter(v => v.num >= 10); // Ignore < $10
      
      if (values.length === 0) return null;
      
      const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
      return maxValue.str;
    });
    
    if (value) {
      console.log('[Ready] Extracted largest value: ' + value);
      return { value, success: true, platform: 'ready' };
    }
    
    return { value: null, success: false, platform: 'ready', error: 'No portfolio value found' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Ready] Error:', msg);
    return { value: null, success: false, platform: 'ready', error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// APTOS / APTOSCAN SCRAPER (Opportunistic - Largest Value Strategy)
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
    console.log('[Aptoscan] Starting Aptos scraper (opportunistic)');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate and wait for initial load
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: 25000 }).catch(e => 
      console.log('[Aptoscan] Navigation warning: ' + e.message)
    );
    
    // Quick wait for rendering
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract ALL text and find largest value
    const value = await page.evaluate(() => {
      const fullText = document.body.innerText;
      const regex = /\$[\d,]+(?:\.\d{2})?/g;
      const matches = fullText.match(regex);
      
      if (!matches || matches.length === 0) return null;
      
      const values = matches
        .map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,]/g, ''))
        }))
        .filter(v => v.num >= 10); // Ignore < $10
      
      if (values.length === 0) return null;
      
      const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
      return maxValue.str;
    });
    
    if (value) {
      console.log('[Aptoscan] Extracted largest value: ' + value);
      return { value, success: true, platform: 'aptoscan' };
    }
    
    return { value: null, success: false, platform: 'aptoscan', error: 'No portfolio value found' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Aptoscan] Error:', msg);
    return { value: null, success: false, platform: 'aptoscan', error: msg };
  } finally {
    clearTimeout(timeoutId);
    await page.close().catch(() => {});
  }
}

// ============================================================================
// SEI / SEISCAN SCRAPER (Opportunistic - Largest Value Strategy)
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
    console.log('[Seiscan] Starting Sei scraper (opportunistic)');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate and wait for initial load
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: 25000 }).catch(e => 
      console.log('[Seiscan] Navigation warning: ' + e.message)
    );
    
    // Quick wait for rendering
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract ALL text and find largest value
    const value = await page.evaluate(() => {
      const fullText = document.body.innerText;
      const regex = /\$[\d,]+(?:\.\d{2})?/g;
      const matches = fullText.match(regex);
      
      if (!matches || matches.length === 0) return null;
      
      const values = matches
        .map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,]/g, ''))
        }))
        .filter(v => v.num >= 10); // Ignore < $10
      
      if (values.length === 0) return null;
      
      const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
      return maxValue.str;
    });
    
    if (value) {
      console.log('[Seiscan] Extracted largest value: ' + value);
      return { value, success: true, platform: 'seiscan' };
    }
    
    return { value: null, success: false, platform: 'seiscan', error: 'No portfolio value found' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Seiscan] Error:', msg);
    return { value: null, success: false, platform: 'seiscan', error: msg };
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
    console.log('[Generic] Starting opportunistic DOM scraper');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Navigate and wait for initial load
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: timeoutMs - 5000 }).catch(e => 
      console.log('[Generic] Navigation warning: ' + e.message)
    );
    
    // Quick wait for rendering
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract ALL text and find largest value
    const value = await page.evaluate(() => {
      const fullText = document.body.innerText;
      const regex = /\$[\d,]+(?:\.\d{2})?/g;
      const matches = fullText.match(regex);
      
      if (!matches || matches.length === 0) return null;
      
      const values = matches
        .map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,]/g, ''))
        }))
        .filter(v => v.num >= 10); // Ignore < $10
      
      if (values.length === 0) return null;
      
      const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
      return maxValue.str;
    });
    
    if (value) {
      console.log('[Generic] Extracted largest value: ' + value);
      return { value, success: true, platform: 'generic' };
    }
    
    return { value: null, success: false, platform: 'generic', error: 'No portfolio value found' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Generic] Error:', msg);
    return { value: null, success: false, platform: 'generic', error: msg };
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
  console.log(`[Platform] Selecting scraper for: ${walletName} (${walletLink})`);
  
  try {
    // ==================== DEBANK (Special case - fixed)
    if (walletLink.includes('debank.com')) {
      if (!browser) {
        return { value: null, success: false, platform: 'debank', error: 'Browser not available' };
      }
      return await scrapeDebankEVM(browser, walletLink, 60000);
    }
    
    // ==================== RECOGNIZED PLATFORMS (with specific timeouts)
    // SPECIAL CASE: jup.ag/portfolio - Use Net Worth specific scraper
    if (walletLink.includes('jup.ag/portfolio')) {
      if (!browser) return { value: null, success: false, platform: 'jupiter', error: 'Browser not available' };
      console.log('[Platform] Jupiter Portfolio detected - using Net Worth specific scraper');
      return await scrapeJupiterPortfolioNetWorth(browser, walletLink, 30000);
    }
    
    // Generic Jupiter scraper for other jup.ag links
    if (walletLink.includes('jup.ag')) {
      if (!browser) return { value: null, success: false, platform: 'jupiter', error: 'Browser not available' };
      return await scrapeJupiterSolana(browser, walletLink, 45000);
    }
    
    if (walletLink.includes('portfolio.ready.co')) {
      if (!browser) return { value: null, success: false, platform: 'ready', error: 'Browser not available' };
      return await scrapeReadyStarknet(browser, walletLink, 45000);
    }
    
    if (walletLink.includes('aptoscan.com')) {
      if (!browser) return { value: null, success: false, platform: 'aptoscan', error: 'Browser not available' };
      return await scrapeAptoscanAptos(browser, walletLink, 30000);
    }
    
    if (walletLink.includes('seiscan.io')) {
      if (!browser) return { value: null, success: false, platform: 'seiscan', error: 'Browser not available' };
      return await scrapeSeiscanSei(browser, walletLink, 30000);
    }
    
    // ==================== FALLBACK: Generic opportunistic scraper for ANY other platform
    console.log(`[Platform] Platform not recognized, using generic opportunistic scraper`);
    if (!browser) {
      return { value: null, success: false, platform: 'generic', error: 'Browser not available' };
    }
    return await scrapeGenericOpportunistic(browser, walletLink, 30000);
    
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Platform] Unhandled error:`, msg);
    return { value: null, success: false, platform: 'generic', error: msg };
  }
}
