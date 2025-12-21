import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { addCacheEntry } from './walletCache';
import { selectAndScrapePlatform } from './platformScrapers';

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
  status: 'success' | 'temporary_error' | 'unavailable';
  lastKnownValue?: string;
}

let WALLETS: WalletConfig[] = [];

export function setWallets(newWallets: WalletConfig[]): void {
  WALLETS = newWallets;
}

const balanceCache = new Map<string, WalletBalance>();
let refreshInterval: NodeJS.Timeout | null = null;

async function getChromiumPath(): Promise<string> {
  // Try Puppeteer installed Chrome first
  try {
    const puppeteerChrome = '/home/codespace/.cache/puppeteer/chrome/linux-143.0.7499.146/chrome-linux64/chrome';
    const { stdout } = await execAsync(`ls -la "${puppeteerChrome}" 2>/dev/null | head -1`);
    if (stdout.trim()) {
      console.log('[Browser] Found Puppeteer Chrome at:', puppeteerChrome);
      return puppeteerChrome;
    }
  } catch (_) {
    // Continue to Firefox
  }
  
  // Try Firefox as fallback
  try {
    const puppeteerFirefox = '/home/codespace/.cache/puppeteer/firefox/linux-stable_146.0/firefox/firefox';
    const { stdout } = await execAsync(`ls -la "${puppeteerFirefox}" 2>/dev/null | head -1`);
    if (stdout.trim()) {
      console.log('[Browser] Found Puppeteer Firefox at:', puppeteerFirefox);
      return puppeteerFirefox;
    }
  } catch (_) {
    // Continue to system browsers
  }
  
  try {
    const { stdout } = await execAsync('which chromium');
    return stdout.trim();
  } catch (error) {
    try {
      const { stdout } = await execAsync("ls -la /nix/store/*/bin/chromium 2>/dev/null | tail -1 | awk '{print $NF}'");
      const path = stdout.trim();
      if (path && path.length > 0) {
        console.log('[Browser] Found chromium at:', path);
        return path;
      }
    } catch (_) {
      // Fallback search
    }
    
    console.warn('[Browser] No browsers found, attempting auto-discovery...');
    return 'chromium';
  }
}

// ============================================================================
// MAIN SCRAPING WITH TIMEOUT & FALLBACK
// ============================================================================

async function scrapeWalletWithTimeout(
  browser: Browser | null,
  wallet: WalletConfig,
  timeoutMs: number = 65000
): Promise<WalletBalance> {
  console.log(`[Main] Starting scrape for ${wallet.name} with ${timeoutMs}ms timeout`);
  
  let timeoutHandle: NodeJS.Timeout | null = null;
  let completed = false;
  
  return new Promise((resolve) => {
    const executeScrap = async () => {
      try {
        // Call platform-specific scraper
        const result = await selectAndScrapePlatform(browser || null, wallet.link, wallet.name);
        completed = true;
        
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        if (result.success && result.value) {
          console.log(`[Main] Success: ${wallet.name} = ${result.value}`);
          
          // Save to cache
          addCacheEntry(wallet.name, result.value, result.platform, 'success');
          
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: result.value,
            lastUpdated: new Date(),
            status: 'success',
            lastKnownValue: result.value
          });
        } else {
          // Try fallback cache
          const cached = balanceCache.get(wallet.name);
          
          if (cached?.lastKnownValue) {
            console.log(`[Main] Scrape failed, using cache: ${cached.lastKnownValue}`);
            addCacheEntry(wallet.name, cached.lastKnownValue, result.platform, 'temporary_error');
            
            resolve({
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: cached.lastKnownValue,
              lastUpdated: cached.lastUpdated,
              status: 'temporary_error',
              lastKnownValue: cached.lastKnownValue,
              error: result.error || 'Scrape failed'
            });
          } else {
            console.log(`[Main] Scrape failed, no cache: ${result.error}`);
            addCacheEntry(wallet.name, 'Indisponível', result.platform, 'unavailable');
            
            resolve({
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: 'Indisponível',
              lastUpdated: new Date(),
              status: 'unavailable',
              error: result.error || 'Impossível conectar'
            });
          }
        }
      } catch (error) {
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Main] Unhandled error: ${msg}`);
        
        const cached = balanceCache.get(wallet.name);
        if (cached?.lastKnownValue) {
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: cached.lastKnownValue,
            lastUpdated: cached.lastUpdated,
            status: 'temporary_error',
            lastKnownValue: cached.lastKnownValue,
            error: msg
          });
        } else {
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: 'Indisponível',
            lastUpdated: new Date(),
            status: 'unavailable',
            error: msg
          });
        }
      }
    };
    
    // Execute with timeout
    executeScrap();
    
    timeoutHandle = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.log(`[Main] Timeout for ${wallet.name}, using fallback cache`);
        
        const cached = balanceCache.get(wallet.name);
        if (cached?.lastKnownValue) {
          addCacheEntry(wallet.name, cached.lastKnownValue, 'unknown', 'temporary_error');
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: cached.lastKnownValue,
            lastUpdated: cached.lastUpdated,
            status: 'temporary_error',
            lastKnownValue: cached.lastKnownValue,
            error: 'Timeout - using cached value'
          });
        } else {
          addCacheEntry(wallet.name, 'Indisponível', 'unknown', 'unavailable');
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: 'Indisponível',
            lastUpdated: new Date(),
            status: 'unavailable',
            error: 'Timeout - no cache available'
          });
        }
      }
    }, timeoutMs);
  });
}

// ============================================================================
// BROWSER LAUNCH WITH FALLBACKS
// ============================================================================

async function launchBrowserWithFallbacks(): Promise<Browser | null> {
  const browsers = [
    { name: 'Chrome', path: '/home/codespace/.cache/puppeteer/chrome/linux-143.0.7499.146/chrome-linux64/chrome' },
    { name: 'Firefox', path: '/home/codespace/.cache/puppeteer/firefox/linux-stable_146.0/firefox/firefox' }
  ];
  
  for (const browser of browsers) {
    try {
      console.log(`[Browser] Trying to launch ${browser.name}...`);
      
      const launchedBrowser = await puppeteerExtra.launch({
        headless: true,
        product: browser.name.toLowerCase() as any,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-hang-monitor',
          '--disable-prompt-on-repost',
          '--force-color-profile=srgb',
          '--metrics-recording-only',
          '--no-crash-upload',
          '--disable-component-extensions-with-background-pages',
          '--disable-extensions',
          '--disable-plugins'
        ].filter(arg => browser.name === 'Chrome' || !arg.includes('--single-process')), // Firefox doesn't support single-process
        executablePath: browser.path,
      });
      
      console.log(`[Browser] Successfully launched ${browser.name}`);
      return launchedBrowser;
    } catch (error) {
      console.log(`[Browser] Failed to launch ${browser.name}:`, error.message);
      continue;
    }
  }
  
  console.log('[Browser] All browser launch attempts failed');
  return null;
}

// ============================================================================
// SEQUENTIAL WALLET UPDATE
// ============================================================================

async function updateWalletsSequentially(wallets: WalletConfig[]): Promise<void> {
  let browser: Browser | null = null;
  
  try {
    browser = await launchBrowserWithFallbacks();
    
    if (!browser) {
      console.log('[Sequential] No browser available, skipping wallet updates');
      return;
    }

    console.log(`[Sequential] Processing ${wallets.length} wallets sequentially`);
    
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      console.log(`[Sequential] Wallet ${i + 1}/${wallets.length}: ${wallet.name}`);
      
      try {
        // Always provide browser (selectAndScrapePlatform will use it or fallback gracefully)
        const balance = await scrapeWalletWithTimeout(
          browser,
          wallet,
          wallet.link.includes('debank.com') ? 90000 : 60000
        );
        
        balanceCache.set(wallet.name, balance);
        console.log(`[Sequential] Updated ${wallet.name}: ${balance.balance} (${balance.status})`);
      } catch (error) {
        console.error(`[Sequential] Error processing ${wallet.name}:`, error);
        // Set error state for this wallet
        balanceCache.set(wallet.name, {
          id: wallet.id,
          name: wallet.name,
          link: wallet.link,
          balance: 'Indisponível',
          lastUpdated: new Date(),
          status: 'unavailable',
          error: 'Erro no processamento'
        });
      }
      
      // 5 second delay between wallets
      if (i < wallets.length - 1) {
        console.log(`[Sequential] Waiting 5 seconds before next wallet...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    console.error(`[Sequential] Browser launch failed:`, error);
    // If browser launch fails, set all wallets to unavailable
    for (const wallet of wallets) {
      balanceCache.set(wallet.name, {
        id: wallet.id,
        name: wallet.name,
        link: wallet.link,
        balance: 'Indisponível',
        lastUpdated: new Date(),
        status: 'unavailable',
        error: 'Browser não disponível'
      });
    }
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function getBalances(): string[] {
  return Array.from(balanceCache.values()).map(w => w.balance);
}

export function getDetailedBalances(): WalletBalance[] {
  return Array.from(balanceCache.values());
}

export function initializeWallet(wallet: WalletConfig): void {
  if (!balanceCache.has(wallet.name)) {
    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: 'Indisponível',
      lastUpdated: new Date(),
      status: 'unavailable',
      error: 'Aguardando primeira coleta'
    });
    console.log(`[Init] Initialized wallet ${wallet.name} in cache`);
  }
}

export function startStepMonitor(intervalMs: number): void {
  console.log(`[Step.finance] Starting monitor with ${intervalMs / 1000 / 60} minute interval`);
  
  if (refreshInterval) clearInterval(refreshInterval);
  
  // Initial run
  updateWalletsSequentially(WALLETS);
  
  // Schedule periodic updates
  refreshInterval = setInterval(() => {
    console.log('[Step.finance] Scheduled wallet update');
    updateWalletsSequentially(WALLETS);
  }, intervalMs);
}

export async function forceRefreshAndWait(): Promise<WalletBalance[]> {
  console.log('[Force] Manual refresh requested');
  
  // Don't set loading state, just trigger refresh
  await updateWalletsSequentially(WALLETS);
  return getDetailedBalances();
}

export async function forceRefreshWallet(walletName: string): Promise<WalletBalance> {
  console.log(`[Force] Refreshing wallet: ${walletName}`);
  
  const wallet = WALLETS.find(w => w.name === walletName);
  if (!wallet) {
    console.log(`[Force] Wallet not found: ${walletName}`);
    return {
      name: walletName,
      link: '',
      balance: 'Indisponível',
      lastUpdated: new Date(),
      status: 'unavailable',
      error: 'Wallet not found'
    };
  }

  let browser: Browser | null = null;

  try {
    const chromiumPath = await getChromiumPath();
    
    // Only create browser if needed
    const needsBrowser = wallet.link.includes('debank.com') || 
                        wallet.link.includes('jup.ag') || 
                        wallet.link.includes('portfolio.ready.co');
    
    if (needsBrowser) {
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
    }
    
    const timeoutMs = wallet.link.includes('debank.com') ? 90000 :
                     wallet.link.includes('jup.ag') ? 70000 :
                     wallet.link.includes('portfolio.ready.co') ? 70000 : 50000;
    
    const balance = await scrapeWalletWithTimeout(browser, wallet, timeoutMs);
    balanceCache.set(wallet.name, balance);
    
    return balance;
  } catch (error) {
    console.error(`[Force] Error:`, error);
    const cached = balanceCache.get(walletName);
    return {
      name: walletName,
      link: wallet?.link || '',
      balance: cached?.lastKnownValue || 'Indisponível',
      lastUpdated: new Date(),
      status: cached?.lastKnownValue ? 'temporary_error' : 'unavailable',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

export async function forceRefresh(): Promise<WalletBalance[]> {
  console.log('[Force] Refresh started (no wait)');
  updateWalletsSequentially(WALLETS);
  return getDetailedBalances();
}
