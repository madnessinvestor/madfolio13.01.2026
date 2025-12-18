import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { addCacheEntry } from './walletCache';
import { fetchJupPortfolio } from './jupAgScraper';

// Use stealth plugin to bypass anti-bot detection
puppeteerExtra.use(StealthPlugin());

const execAsync = promisify(exec);

interface WalletConfig {
  id?: string;
  name: string;
  link: string;
}

interface WalletBalance {
  id?: string;
  name: string;
  link: string;
  balance: string;
  lastUpdated: Date;
  error?: string;
  status: 'success' | 'temporary_error' | 'unavailable'; // 'success': valor válido atual; 'temporary_error': falha mas tem cache; 'unavailable': nunca teve valor
  lastKnownValue?: string; // Último valor válido para fallback
}

let WALLETS: WalletConfig[] = [];

export function setWallets(newWallets: WalletConfig[]): void {
  WALLETS = newWallets;
}

const balanceCache = new Map<string, WalletBalance>();
let refreshInterval: NodeJS.Timeout | null = null;
let walletUpdateTimeouts: Map<string, NodeJS.Timeout> = new Map();

async function getChromiumPath(): Promise<string> {
  try {
    const { stdout } = await execAsync('which chromium');
    return stdout.trim();
  } catch (error) {
    console.error('Could not find chromium:', error);
    return '/nix/store/chromium/bin/chromium';
  }
}

async function extractAddressFromLink(link: string): Promise<string | null> {
  const ethMatch = link.match(/0x[a-fA-F0-9]{40}/);
  if (ethMatch) return ethMatch[0];
  
  const solanaMatch = link.match(/wallet=([A-Za-z0-9]+)/);
  if (solanaMatch) return solanaMatch[1];
  
  return null;
}

// DeBank selectors - múltiplos fallbacks para encontrar Net Worth
const debankSelectors = [
  '[class*="NetWorth"]',
  '[class*="networth"]',
  'div:has-text("Net Worth")',
  '[data-testid*="net-worth"]',
  '[title*="Net Worth"]'
];

// Extract net worth for DeBank with multiple fallback selectors
async function extractDebankNetWorth(page: any, walletName: string, attempt: number): Promise<string | null> {
  console.log(`[Step.finance] [Attempt ${attempt}/3] Extracting DeBank Net Worth for ${walletName}`);
  
  try {
    const netWorth = await page.evaluate(() => {
      try {
        const pageText = document.body.innerText;
        const lines = pageText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        // Strategy: Look for the pattern "$X -Y%" or "$X +Y%" which appears in the top-right
        // This is the total portfolio value displayed prominently with the price change
        // Search only in the first 30 lines (top of page where the value is displayed)
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
          const line = lines[i];
          
          // Look for pattern: $X,XXX -Y.YY% or $X +Y.YY% (both negative and positive changes)
          // This matches the portfolio total value in the top-right corner with its percentage change
          const match = line.match(/^\$\s*([\d,]+(?:\.\d{2})?)\s+[-+][\d.]+%/);
          if (match) {
            const value = match[1];
            console.log('[Debank] Found top-right portfolio value: ' + value);
            return value;
          }
        }
        
        // Fallback: If pattern not found, look for first $ value on a line by itself
        for (let i = 0; i < Math.min(lines.length, 50); i++) {
          const line = lines[i];
          if (line.startsWith('$')) {
            const match = line.match(/^\$\s*([\d,]+\.?\d*)/);
            if (match) {
              const value = match[1];
              const numValue = parseFloat(value.replace(/,/g, ''));
              if (numValue > 0 && numValue < 10000000) {
                console.log('[Debank] Fallback - found value: ' + value);
                return value;
              }
            }
          }
        }
        
        return null;
      } catch (error) {
        console.log('[Debank] Extraction error: ' + error);
        return null;
      }
    });

    if (netWorth) {
      console.log(`[Step.finance] [Attempt ${attempt}/3] Found value: $${netWorth}`);
      return `$${netWorth}`;
    }
  } catch (error) {
    console.log(`[Step.finance] [Attempt ${attempt}/3] Error: ${error}`);
  }
  
  return null;
}

// Extract Net Worth for Jup.Ag
async function extractJupAgNetWorth(page: any, walletName: string, attempt: number): Promise<string | null> {
  console.log(`[Step.finance] [Attempt ${attempt}/3] Extracting Jup.Ag Net Worth for ${walletName}`);
  
  // Wait extra time for heavy pages (10 more seconds beyond the 20s initial wait)
  await page.evaluate(() => new Promise(r => setTimeout(r, 10000)));
  
  try {
    const result = await page.evaluate(() => {
      // Try both innerText and textContent to capture all visible text
      const pageText = (document.body.innerText || '') + '\n' + (document.body.textContent || '');
      
      const allValues: Array<{ str: string; num: number }> = [];
      
      // Strategy 1: Extract currency formatted numbers ($X,XXX.XX or €2.008,95)
      const currencyMatches = pageText.match(/[\$€][\s]*[\d,.]+/g) || [];
      
      for (const match of currencyMatches) {
        const value = match.replace(/[\$€\s]/g, '');
        let numValue: number;
        
        if (value.includes('.') && value.includes(',')) {
          const lastDot = value.lastIndexOf('.');
          const lastComma = value.lastIndexOf(',');
          numValue = lastComma > lastDot 
            ? parseFloat(value.replace(/\./g, '').replace(',', '.'))
            : parseFloat(value.replace(/,/g, ''));
        } else if (value.includes(',')) {
          numValue = parseFloat(value.replace(',', '.'));
        } else if (value.includes('.')) {
          const parts = value.split('.');
          numValue = parts[parts.length - 1].length <= 2 && parts[0].length > 2
            ? parseFloat(value.replace(/\./g, ''))
            : parseFloat(value);
        } else {
          numValue = parseFloat(value);
        }
        
        if (!isNaN(numValue) && numValue > 0) {
          allValues.push({ str: value, num: numValue });
        }
      }
      
      // Strategy 2: Extract ANY number with dots and/or commas (aggressive matching for all numeric patterns)
      const bigNumberMatches = pageText.match(/\d+(?:[.,]\d+)+/g) || [];
      
      for (const match of bigNumberMatches) {
        let numValue: number;
        
        if (match.includes('.') && match.includes(',')) {
          const lastDot = match.lastIndexOf('.');
          const lastComma = match.lastIndexOf(',');
          numValue = lastComma > lastDot 
            ? parseFloat(match.replace(/\./g, '').replace(',', '.'))
            : parseFloat(match.replace(/,/g, ''));
        } else if (match.includes(',')) {
          numValue = parseFloat(match.replace(',', '.'));
        } else if (match.includes('.')) {
          const parts = match.split('.');
          numValue = parts[parts.length - 1].length <= 2
            ? parseFloat(match.replace(/\./g, ''))
            : parseFloat(match);
        } else {
          numValue = parseFloat(match);
        }
        
        // Avoid duplicates
        if (!isNaN(numValue) && numValue > 0 && !allValues.some(v => v.num === numValue)) {
          allValues.push({ str: match, num: numValue });
        }
      }
      
      allValues.sort((a, b) => b.num - a.num);
      return { allValues };
    });

    // Extract largest currency value found
    if (result.allValues && result.allValues.length > 0) {
      console.log(`[Jup.Ag Debug] Top 5 currency values:`, result.allValues.slice(0, 5).map((v: any) => `${v.str}=${v.num}`).join(', '));
      
      // Accept values from $10 upward (more flexible lower bound)
      for (const item of result.allValues) {
        if (item.num >= 10 && item.num < 100000000) {
          console.log(`[Step.finance] [Attempt ${attempt}/3] Found Jup.Ag Net Worth: $${item.str} (${item.num})`);
          return `$${item.str}`;
        }
      }
    }
    
    console.log(`[Jup.Ag Debug] No valid value found`);
  } catch (error) {
    console.log(`[Step.finance] [Attempt ${attempt}/3] Jup.Ag extraction error: ${error}`);
  }
  
  return null;
}

// Extract portfolio value for Step.Finance
async function extractStepFinancePortfolioValue(page: any, walletName: string, attempt: number): Promise<string | null> {
  console.log(`[Step.finance] [Attempt ${attempt}/3] Extracting Step.Finance Portfolio Value for ${walletName}`);
  
  try {
    const portfolioValue = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const lines = pageText.split('\n').map(l => l.trim()).filter(l => l);
      
      for (let i = 0; i < lines.length; i++) {
        if (/portfolio|patrimônio|total\s+value/i.test(lines[i])) {
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            const match = lines[j].match(/\$?\s*([\d,]+\.?\d*(?:[KMB])?)/);
            if (match && !/%/.test(lines[j]) && !lines[j].toLowerCase().includes('change')) {
              return match[1];
            }
          }
        }
      }
      
      return null;
    });

    if (portfolioValue) {
      console.log(`[Step.finance] [Attempt ${attempt}/3] Found portfolio value: $${portfolioValue}`);
      return `$${portfolioValue}`;
    }
  } catch (error) {
    console.log(`[Step.finance] [Attempt ${attempt}/3] Error extracting portfolio value: ${error}`);
  }
  
  return null;
}

// Generic fallback extraction
async function extractGenericValue(page: any, walletName: string, attempt: number): Promise<string | null> {
  console.log(`[Step.finance] [Attempt ${attempt}/3] Using generic extraction for ${walletName}`);
  
  try {
    const value = await page.evaluate(() => {
      const allText = document.body.innerText;
      const lines = allText.split('\n').map(l => l.trim()).filter(l => l);
      
      for (const line of lines) {
        if (/earnings|profit|loss|fee|gain|%|time|date|hour|minute|second|tx|transaction|volume|change/i.test(line)) continue;
        if (line.length > 100) continue;
        
        const match = line.match(/\$?\s*([\d]{1,3}(?:[,][\d]{3})*(?:[.][\d]{2,})?(?:[KMB])?)/);
        if (match) {
          const amount = match[1];
          if (amount.includes(',') || amount.includes('.')) {
            const numValue = parseFloat(amount.replace(/,/g, ''));
            if (numValue > 10) {
              return `$${amount}`;
            }
          }
        }
      }
      
      return null;
    });

    if (value) {
      console.log(`[Step.finance] [Attempt ${attempt}/3] Found generic value: ${value}`);
      return value;
    }
  } catch (error) {
    console.log(`[Step.finance] [Attempt ${attempt}/3] Generic extraction error: ${error}`);
  }
  
  return null;
}

async function scrapeWalletBalanceWithRetry(
  browser: Browser,
  wallet: WalletConfig,
  maxRetries: number = 3
): Promise<WalletBalance> {
  let lastError: string | undefined;
  let lastKnownValue: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const page = await browser.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Fetching balance for ${wallet.name}`);
      
      // Try API first for Jup.Ag
      if (wallet.link.includes('jup.ag')) {
        const portfolioMatch = wallet.link.match(/\/portfolio\/([a-zA-Z0-9]+)/);
        if (portfolioMatch) {
          const portfolioId = portfolioMatch[1];
          try {
            console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Trying Jup.Ag API for portfolio ${portfolioId}`);
            
            const portfolio = await fetchJupPortfolio(portfolioId);
            if (portfolio && portfolio.netWorthUSD > 0) {
              const formatted = `$${portfolio.netWorthUSD.toFixed(2)}`;
              console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Success via Jup.Ag API: ${formatted}`);
              
              await page.close();
              return {
                id: wallet.id,
                name: wallet.name,
                link: wallet.link,
                balance: formatted,
                lastUpdated: new Date(),
                status: 'success',
                lastKnownValue: formatted
              };
            }
          } catch (apiError) {
            console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Jup.Ag API failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
          }
        }
      }

      // Try API for DeBank
      if (wallet.link.includes('debank.com')) {
        const address = await extractAddressFromLink(wallet.link);
        if (address) {
          try {
            const apiUrl = `https://api.debank.com/v1/user/total_balance?id=${address}`;
            console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Trying DeBank API`);
            
            const response = await fetch(apiUrl, {
              headers: { "Accept": "application/json" }
            });

            if (response.ok) {
              const data = await response.json() as any;
              const balanceUSD = data.total_usd_value || 0;
              const formatted = `$${balanceUSD.toFixed(2)}`;
              console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Success via API: ${formatted}`);
              
              await page.close();
              return {
                id: wallet.id,
                name: wallet.name,
                link: wallet.link,
                balance: formatted,
                lastUpdated: new Date(),
                status: 'success',
                lastKnownValue: formatted
              };
            }
          } catch (apiError) {
            console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] API failed: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
          }
        }
      }

      // Web scraping fallback
      console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Starting web scraping`);
      await page.goto(wallet.link, { 
        waitUntil: 'networkidle2',
        timeout: 120000 
      }).catch((err) => {
        console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Page load warning: ${err.message}`);
      });

      console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Mandatory 20-second wait for JS rendering`);
      await new Promise(resolve => setTimeout(resolve, 20000));

      let balance: string | null = null;

      if (wallet.link.includes('jup.ag')) {
        balance = await extractJupAgNetWorth(page, wallet.name, attempt);
      } else if (wallet.link.includes('step.finance')) {
        balance = await extractStepFinancePortfolioValue(page, wallet.name, attempt);
      } else if (wallet.link.includes('debank.com')) {
        balance = await extractDebankNetWorth(page, wallet.name, attempt);
      }

      if (!balance) {
        balance = await extractGenericValue(page, wallet.name, attempt);
      }

      await page.close();

      const cleanBalance = balance ? balance.trim() : null;
      const isValidBalance = cleanBalance && cleanBalance !== ',' && cleanBalance !== '$' && cleanBalance.match(/[\d,]/);

      if (isValidBalance) {
        console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Success: ${cleanBalance}`);
        
        // Save to persistent cache
        let platform = 'debank';
        if (wallet.link.includes('step.finance')) platform = 'step';
        if (wallet.link.includes('jup.ag')) platform = 'jup';
        addCacheEntry(wallet.name, cleanBalance, platform, 'success');
        
        const cachedEntry = balanceCache.get(wallet.name);
        return {
          id: wallet.id,
          name: wallet.name,
          link: wallet.link,
          balance: cleanBalance,
          lastUpdated: new Date(),
          status: 'success',
          lastKnownValue: cleanBalance
        };
      } else {
        lastError = 'Valor numérico não encontrado';
        if (attempt < maxRetries) {
          console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] No value found, retrying in 10 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 10000));
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Error: ${lastError}`);
      
      if (attempt < maxRetries) {
        console.log(`[Step.finance] [Attempt ${attempt}/${maxRetries}] Retrying in 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    } finally {
      await page.close().catch(() => {});
    }
  }

  // All retries exhausted
  const cachedEntry = balanceCache.get(wallet.name);
  
  if (cachedEntry?.lastKnownValue) {
    console.log(`[Step.finance] All retries failed for ${wallet.name}, using cached value: ${cachedEntry.lastKnownValue}`);
    
    // Save error attempt to persistent cache
    let platform = 'debank';
    if (wallet.link.includes('step.finance')) platform = 'step';
    if (wallet.link.includes('jup.ag')) platform = 'jup';
    addCacheEntry(wallet.name, cachedEntry.lastKnownValue, platform, 'temporary_error');
    
    return {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: cachedEntry.lastKnownValue,
      lastUpdated: cachedEntry.lastUpdated,
      status: 'temporary_error',
      lastKnownValue: cachedEntry.lastKnownValue,
      error: `Atualização falhou (3 tentativas): ${lastError}`
    };
  }

  console.log(`[Step.finance] No value ever found for ${wallet.name}`);
  return {
    id: wallet.id,
    name: wallet.name,
    link: wallet.link,
    balance: 'Indisponível',
    lastUpdated: new Date(),
    status: 'unavailable',
    error: lastError || 'Impossível conectar'
  };
}

async function updateWalletBalanceSequential(wallets: WalletConfig[]): Promise<void> {
  let browser: Browser | null = null;

  try {
    const chromiumPath = await getChromiumPath();
    
    browser = await puppeteerExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
      executablePath: chromiumPath,
    });

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      console.log(`[Step.finance] Processing wallet ${i + 1}/${wallets.length}: ${wallet.name}`);
      
      const balance = await scrapeWalletBalanceWithRetry(browser, wallet, 3);
      balanceCache.set(wallet.name, balance);
      console.log(`[Step.finance] Updated ${wallet.name}: ${balance.balance} (${balance.status})`);

      if (i < wallets.length - 1) {
        console.log(`[Step.finance] Waiting 5 seconds before next wallet...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    console.error(`[Step.finance] Error in sequential wallet update:`, error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function scheduleWalletUpdates(): Promise<void> {
  console.log(`[Step.finance] Scheduling ${WALLETS.length} wallets for sequential update`);
  await updateWalletBalanceSequential(WALLETS);
}

export async function forceRefreshAndWait(): Promise<WalletBalance[]> {
  console.log('[Step.finance] Force refresh requested - starting sequential wallet updates');
  
  walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
  walletUpdateTimeouts.clear();
  
  for (const wallet of WALLETS) {
    const cached = balanceCache.get(wallet.name);
    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: cached?.balance || 'Carregando...',
      lastUpdated: new Date(),
      status: 'success',
      lastKnownValue: cached?.lastKnownValue
    });
  }
  
  await updateWalletBalanceSequential(WALLETS);
  return getDetailedBalances();
}

// Refresh individual wallet
export async function forceRefreshWallet(walletName: string): Promise<WalletBalance | null> {
  console.log(`[Step.finance] Force refresh for wallet: ${walletName}`);
  
  const wallet = WALLETS.find(w => w.name === walletName);
  if (!wallet) {
    console.log(`[Step.finance] Wallet not found: ${walletName}`);
    return null;
  }

  let browser: Browser | null = null;

  try {
    const chromiumPath = await getChromiumPath();
    
    browser = await puppeteerExtra.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
      executablePath: chromiumPath,
    });

    const balance = await scrapeWalletBalanceWithRetry(browser, wallet, 3);
    balanceCache.set(wallet.name, balance);
    console.log(`[Step.finance] Updated ${wallet.name}: ${balance.balance} (${balance.status})`);
    
    return balance;
  } catch (error) {
    console.error(`[Step.finance] Error refreshing ${walletName}:`, error);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export function getBalances(): Record<string, string> {
  const result: Record<string, string> = {};
  
  for (const wallet of WALLETS) {
    const cached = balanceCache.get(wallet.name);
    result[wallet.name] = cached?.balance || 'Loading...';
  }
  
  return result;
}

export function getDetailedBalances(): WalletBalance[] {
  return WALLETS.map(wallet => {
    const cached = balanceCache.get(wallet.name);
    return {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: cached?.balance || 'Loading...',
      lastUpdated: cached?.lastUpdated || new Date(),
      status: cached?.status || 'unavailable',
      lastKnownValue: cached?.lastKnownValue,
      error: cached?.error,
    };
  });
}

export function startStepMonitor(intervalMs: number = 60 * 60 * 1000): void {
  const intervalMinutes = intervalMs / 1000 / 60;
  console.log(`[Step.finance] Starting monitor with ${intervalMinutes} minute interval - wallets processed sequentially with retry logic`);

  for (const wallet of WALLETS) {
    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: 'Loading...',
      lastUpdated: new Date(),
      status: 'unavailable'
    });
  }

  setTimeout(async () => {
    await scheduleWalletUpdates();
  }, 5000);

  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(async () => {
    walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
    walletUpdateTimeouts.clear();
    
    await scheduleWalletUpdates();
  }, intervalMs);
}

export function stopStepMonitor(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  
  walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
  walletUpdateTimeouts.clear();
  
  console.log('[Step.finance] Monitor stopped');
}

export async function forceRefresh(): Promise<void> {
  walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
  walletUpdateTimeouts.clear();
  
  await scheduleWalletUpdates();
}
