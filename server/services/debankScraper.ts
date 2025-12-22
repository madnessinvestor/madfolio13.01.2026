import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { addCacheEntry } from './walletCache';
import { selectAndScrapePlatform } from './platformScrapers';
import { storage } from '../storage';

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

async function updateAssetForWallet(walletName: string, balance: string): Promise<void> {
  try {
    // Parse balance to number
    const balanceValue = parseFloat(balance.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    
    // Find asset with symbol or name matching wallet name and market crypto_simplified
    const assets = await storage.getAssets();
    const matchingAsset = assets.find(asset => 
      asset.market === 'crypto_simplified' && 
      (asset.symbol === walletName || asset.name === walletName)
    );
    
    if (matchingAsset && balanceValue > 0) {
      await storage.updateAsset(matchingAsset.id, { 
        currentPrice: balanceValue, 
        lastPriceUpdate: new Date() 
      });
      console.log(`[Asset Update] Updated asset ${matchingAsset.symbol} with balance ${balanceValue}`);
    }
  } catch (error) {
    console.error(`[Asset Update] Error updating asset for wallet ${walletName}:`, error);
  }
}

export function setWallets(newWallets: WalletConfig[]): void {
  WALLETS = newWallets;
  // Clean balanceCache to remove deleted wallets
  const newNames = new Set(newWallets.map(w => w.name));
  for (const [name] of balanceCache) {
    if (!newNames.has(name)) {
      balanceCache.delete(name);
    }
  }
}

const balanceCache = new Map<string, WalletBalance>();
let refreshInterval: NodeJS.Timeout | null = null;

async function getChromiumPath(): Promise<string> {
  try {
    const { stdout } = await execAsync('which chromium');
    return stdout.trim();
  } catch (error) {
    console.error('Could not find chromium:', error);
    return '/nix/store/chromium/bin/chromium';
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
            balance: 'Carregando...',
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
// SEQUENTIAL WALLET UPDATE
// ============================================================================

async function updateWalletsSequentially(wallets: WalletConfig[]): Promise<void> {
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
        '--disable-accelerated-jpeg-decoding',
        '--disable-accelerated-video-decode',
        '--no-first-run',
        '--single-process',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions'
      ],
      executablePath: chromiumPath,
      timeout: 30000,
    });

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
        
        // Update corresponding asset if balance was successfully retrieved
        if (balance.status === 'success') {
          await updateAssetForWallet(wallet.name, balance.balance);
        }
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
    console.error(`[Sequential] Error:`, error);
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
  const walletNames = new Set(WALLETS.map(w => w.name));
  return Array.from(balanceCache.values()).filter(balance => walletNames.has(balance.name)).map(w => w.balance);
}

export function getDetailedBalances(): WalletBalance[] {
  const walletNames = new Set(WALLETS.map(w => w.name));
  // Ensure all wallets have at least their last known value
  const balances = Array.from(balanceCache.values()).filter(balance => walletNames.has(balance.name)).map(wallet => {
    // If balance is "Carregando..." or "Indisponível", try to use last known value
    if ((wallet.balance === "Carregando..." || wallet.balance === "Indisponível") && wallet.lastKnownValue) {
      return {
        ...wallet,
        balance: wallet.lastKnownValue,
        status: 'temporary_error' as const,
      };
    }
    return wallet;
  });
  return balances;
}

export function initializeWallet(wallet: WalletConfig): void {
  if (!balanceCache.has(wallet.name)) {
    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: 'Carregando...',
      lastUpdated: new Date(),
      status: 'unavailable',
      error: 'Aguardando primeira coleta',
      lastKnownValue: undefined
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
  
  await updateWalletsSequentially(WALLETS);
  return getDetailedBalances();
}

export async function forceRefreshWallet(walletName: string): Promise<WalletBalance | null> {
  console.log(`[Force] Refreshing wallet: ${walletName}`);
  
  const wallet = WALLETS.find(w => w.name === walletName);
  if (!wallet) {
    console.log(`[Force] Wallet not found: ${walletName}`);
    return null;
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
    
    const timeoutMs = wallet.link.includes('debank.com') ? 65000 :
                     wallet.link.includes('jup.ag') ? 50000 :
                     wallet.link.includes('portfolio.ready.co') ? 50000 : 35000;
    
    const balance = await scrapeWalletWithTimeout(browser, wallet, timeoutMs);
    balanceCache.set(wallet.name, balance);
    
    // Update corresponding asset if balance was successfully retrieved
    if (balance.status === 'success') {
      await updateAssetForWallet(wallet.name, balance.balance);
    }
    
    return balance;
  } catch (error) {
    console.error(`[Force] Error:`, error);
    return null;
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
