// Platform-specific wallet balance scrapers with timeout & fallback logic
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Browser, Page } from 'puppeteer';

puppeteerExtra.use(StealthPlugin());

export interface ScraperResult {
  value: string | null;
  success: boolean;
  platform: string;
  error?: string;
}

// ============================================================================
// EVM / DEBANK SCRAPER
// ============================================================================

async function extractDebankNetWorthEVM(page: Page): Promise<string | null> {
  console.log('[DeBank] Extracting Net Worth from DOM');
  
  try {
    const netWorth = await page.evaluate(() => {
      try {
        const pageText = document.body.innerText;
        const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Look for pattern: $X,XXX -Y.YY% or $X +Y.YY% (portfolio total with % change)
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          const line = lines[i];
          const match = line.match(/^\$\s*([\d,]+(?:\.\d{2})?)\s+[-+][\d.]+%/);
          if (match) {
            const value = match[1];
            console.log('[DeBank] Found top-right portfolio value: ' + value);
            return value;
          }
        }
        
        // Fallback: Look for first $ value on a line by itself
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          const line = lines[i];
          if (line.startsWith('$')) {
            const match = line.match(/^\$\s*([\d,]+\.?\d*)/);
            if (match) {
              const value = match[1];
              const numValue = parseFloat(value.replace(/,/g, ''));
              if (numValue > 0 && numValue < 10000000) {
                console.log('[DeBank] Fallback - found value: ' + value);
                return value;
              }
            }
          }
        }
        
        return null;
      } catch (error) {
        console.log('[DeBank] Extraction error: ' + error);
        return null;
      }
    });

    return netWorth ? `$${netWorth}` : null;
  } catch (error) {
    console.error('[DeBank] Error:', error);
    return null;
  }
}

export async function scrapeDebankEVM(
  browser: Browser,
  walletLink: string,
  timeoutMs: number = 60000
): Promise<ScraperResult> {
  const page = await browser.newPage();
  const timeoutId = setTimeout(() => {
    page.close().catch(() => {});
  }, timeoutMs);
  
  try {
    console.log('[DeBank] Starting EVM scraper');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Try API first
    const addressMatch = walletLink.match(/0x[a-fA-F0-9]{40}/);
    if (addressMatch) {
      const address = addressMatch[0];
      try {
        console.log('[DeBank] Trying API endpoint');
        const apiResponse = await fetch(`https://api.debank.com/v1/user/total_balance?id=${address}`, {
          headers: { "Accept": "application/json" }
        });
        
        if (apiResponse.ok) {
          const data = await apiResponse.json() as any;
          const balanceUSD = data.total_usd_value || 0;
          const formatted = `$${balanceUSD.toFixed(2)}`;
          console.log('[DeBank] API success: ' + formatted);
          return { value: formatted, success: true, platform: 'debank' };
        }
      } catch (apiError) {
        console.log('[DeBank] API failed, trying DOM scraping');
      }
    }
    
    // DOM scraping fallback
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: 45000 }).catch(e => 
      console.log('[DeBank] Navigation warning: ' + e.message)
    );
    
    // Wait for JS rendering
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    const value = await extractDebankNetWorthEVM(page);
    
    if (value) {
      return { value, success: true, platform: 'debank' };
    }
    
    return { value: null, success: false, platform: 'debank', error: 'Net Worth not found in DOM' };
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
// SOLANA / JUPITER SCRAPER (Network interception)
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
  
  let netWorthValue: string | null = null;
  
  try {
    console.log('[Jupiter] Starting Solana scraper with network interception');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    // Intercept network responses to find portfolio JSON
    page.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        
        // Look for portfolio API responses
        if (url.includes('portfolio') || url.includes('api') || url.includes('jup')) {
          if (contentType.includes('json')) {
            const data = await response.json();
            
            // Extract Net Worth from various possible JSON structures
            if (data.netWorth || data.net_worth || data.totalValue || data.total_value) {
              const value = data.netWorth || data.net_worth || data.totalValue || data.total_value;
              if (typeof value === 'number' && value > 0) {
                netWorthValue = `$${value.toFixed(2)}`;
                console.log('[Jupiter] Found Net Worth in API response: ' + netWorthValue);
              }
            }
          }
        }
      } catch (e) {
        // Ignore errors parsing responses
      }
    });
    
    // Navigate to portfolio
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: 40000 }).catch(e => 
      console.log('[Jupiter] Navigation warning: ' + e.message)
    );
    
    // Wait for value to be intercepted
    let attempts = 0;
    while (!netWorthValue && attempts < 5) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      attempts++;
    }
    
    // Fallback to DOM extraction if API didn't work
    if (!netWorthValue) {
      console.log('[Jupiter] API interception didn\'t find value, trying DOM');
      netWorthValue = await page.evaluate(() => {
        const fullText = document.body.innerText;
        const lines = fullText.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (/\bnet\s+worth\b/i.test(line)) {
            if (/\bpnl\b|\bclaimable\b|−|^\-/i.test(line)) continue;
            
            let valueMatch = line.match(/\$\s*([\d,.]+)/);
            if (!valueMatch) {
              for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
                const nextLine = lines[j].trim();
                if (nextLine && !/\bpnl\b|\bclaimable\b|−|^\-/i.test(nextLine)) {
                  valueMatch = nextLine.match(/\$\s*([\d,.]+)/);
                  if (valueMatch) break;
                }
              }
            }
            
            if (valueMatch) {
              const value = valueMatch[1];
              if (value !== '0.00' && value !== '0' && parseFloat(value.replace(/,/g, '')) > 0) {
                return `$${value}`;
              }
            }
          }
        }
        
        return null;
      });
    }
    
    if (netWorthValue) {
      return { value: netWorthValue, success: true, platform: 'jupiter' };
    }
    
    return { value: null, success: false, platform: 'jupiter', error: 'Net Worth not found' };
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
// STARKNET / READY SCRAPER
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
    console.log('[Ready] Starting Starknet scraper');
    
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto(walletLink, { waitUntil: 'networkidle2', timeout: 40000 }).catch(e => 
      console.log('[Ready] Navigation warning: ' + e.message)
    );
    
    // Wait for JS rendering
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    const value = await page.evaluate(() => {
      const fullText = document.body.innerText;
      const lines = fullText.split('\n');
      
      // Look for "Total Portfolio Value" or similar
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (/total.*portfolio|portfolio.*value/i.test(line)) {
          // Check next few lines for the value
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const nextLine = lines[j].trim();
            const match = nextLine.match(/\$?\s*([\d,]+\.?\d*)/);
            if (match && !/%/.test(nextLine) && !nextLine.toLowerCase().includes('change')) {
              return `$${match[1]}`;
            }
          }
        }
      }
      
      return null;
    });
    
    if (value) {
      return { value, success: true, platform: 'ready' };
    }
    
    return { value: null, success: false, platform: 'ready', error: 'Portfolio value not found' };
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
// APTOS / APTOSCAN SCRAPER (Prefer API)
// ============================================================================

export async function scrapeAptoscanAptos(
  walletLink: string,
  timeoutMs: number = 30000
): Promise<ScraperResult> {
  try {
    console.log('[Aptoscan] Starting Aptos scraper');
    
    // Extract account address from URL
    const addressMatch = walletLink.match(/\/account\/([a-zA-Z0-9]+)/);
    if (!addressMatch) {
      return { value: null, success: false, platform: 'aptoscan', error: 'Could not extract address' };
    }
    
    const address = addressMatch[1];
    
    // Try API first
    try {
      console.log('[Aptoscan] Trying API endpoint');
      const response = await fetch(`https://api.aptoscan.com/v1/account/${address}`, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        const balance = data.balance || data.total_balance || 0;
        if (balance > 0) {
          const formatted = `$${(balance / 1e8).toFixed(2)}`; // APT has 8 decimals
          return { value: formatted, success: true, platform: 'aptoscan' };
        }
      }
    } catch (apiError) {
      console.log('[Aptoscan] API failed: ' + (apiError instanceof Error ? apiError.message : 'Unknown'));
    }
    
    return { value: null, success: false, platform: 'aptoscan', error: 'API call failed' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { value: null, success: false, platform: 'aptoscan', error: msg };
  }
}

// ============================================================================
// SEI / SEISCAN SCRAPER (Prefer API)
// ============================================================================

export async function scrapeSeiscanSei(
  walletLink: string,
  timeoutMs: number = 30000
): Promise<ScraperResult> {
  try {
    console.log('[Seiscan] Starting Sei scraper');
    
    // Extract account address from URL
    const addressMatch = walletLink.match(/\/address\/([a-zA-Z0-9]+)/);
    if (!addressMatch) {
      return { value: null, success: false, platform: 'seiscan', error: 'Could not extract address' };
    }
    
    const address = addressMatch[1];
    
    // Try API first
    try {
      console.log('[Seiscan] Trying API endpoint');
      const response = await fetch(`https://api.seiscan.app/api/v1/account/${address}`, {
        signal: AbortSignal.timeout(timeoutMs)
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        const balance = data.balance || data.total_balance || 0;
        if (balance > 0) {
          const formatted = `$${(balance / 1e6).toFixed(2)}`; // SEI has 6 decimals
          return { value: formatted, success: true, platform: 'seiscan' };
        }
      }
    } catch (apiError) {
      console.log('[Seiscan] API failed: ' + (apiError instanceof Error ? apiError.message : 'Unknown'));
    }
    
    return { value: null, success: false, platform: 'seiscan', error: 'API call failed' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { value: null, success: false, platform: 'seiscan', error: msg };
  }
}

// ============================================================================
// SELECTOR FUNCTION
// ============================================================================

export async function selectAndScrapePlatform(
  browser: Browser | null,
  walletLink: string,
  walletName: string
): Promise<ScraperResult> {
  console.log(`[Platform] Selecting scraper for: ${walletName} (${walletLink})`);
  
  try {
    if (walletLink.includes('debank.com')) {
      if (!browser) return { value: null, success: false, platform: 'debank', error: 'Browser not available' };
      return await scrapeDebankEVM(browser, walletLink, 60000);
    }
    
    if (walletLink.includes('jup.ag')) {
      if (!browser) return { value: null, success: false, platform: 'jupiter', error: 'Browser not available' };
      return await scrapeJupiterSolana(browser, walletLink, 45000);
    }
    
    if (walletLink.includes('portfolio.ready.co')) {
      if (!browser) return { value: null, success: false, platform: 'ready', error: 'Browser not available' };
      return await scrapeReadyStarknet(browser, walletLink, 45000);
    }
    
    if (walletLink.includes('aptoscan.com')) {
      return await scrapeAptoscanAptos(walletLink, 30000);
    }
    
    if (walletLink.includes('seiscan.io')) {
      return await scrapeSeiscanSei(walletLink, 30000);
    }
    
    return { value: null, success: false, platform: 'unknown', error: 'Platform not supported' };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return { value: null, success: false, platform: 'unknown', error: msg };
  }
}
