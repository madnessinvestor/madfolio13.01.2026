import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser } from 'puppeteer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { addCacheEntry, getLastHighestValue } from './walletCache';
import { selectAndScrapePlatform } from './platformScrapers';
import { storage } from '../storage';
import { readCache } from './walletCache';
import { convertToBRL, getExchangeRate } from './exchangeRate';

puppeteerExtra.use(StealthPlugin());
const execAsync = promisify(exec);

let WALLETS: WalletConfig[] = [];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse currency value correctly handling US format
 * Examples:
 * "$54,188" → 54188
 * "$1,234.56" → 1234.56
 * "R$ 54.188" → 54188
 */
function parseCurrencyValue(value: string): number {
  if (!value || typeof value !== 'string') return 0;

  try {
    // Remove currency symbols and spaces from the beginning
    let cleanValue = value.replace(/^[$\s]+/, '').trim();

    // Handle different formats
    if (cleanValue.includes(',') && cleanValue.includes('.')) {
      // Format like "1,234.56" - comma is thousands separator, dot is decimal
      cleanValue = cleanValue.replace(/,/g, '');
    } else if (cleanValue.includes(',')) {
      // Format like "54,188" - comma is thousands separator
      cleanValue = cleanValue.replace(/,/g, '');
    }
    // If only dots, treat as decimal (European format like "1234.56")

    const parsed = parseFloat(cleanValue);
    return isNaN(parsed) ? 0 : parsed;
  } catch (error) {
    console.error(`[Parse] Error parsing currency value "${value}":`, error);
    return 0;
  }
}

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

async function updatePortfolioEvolution(walletName: string, brlValue: number): Promise<void> {
  try {
    // Get current date info
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    // Update portfolio history for future years (2025-2030) with this wallet's value
    // Note: This is a simplified approach - ideally we'd aggregate all wallet values
    // IMPORTANTE: Só atualiza meses NÃO bloqueados
    for (let year = 2025; year <= 2030; year++) {
      try {
        // Verifica se o mês está bloqueado antes de atualizar
        const existingSnapshot = await storage.getMonthlyPortfolioSnapshot("default-user", currentMonth, year);
        
        if (existingSnapshot && existingSnapshot.isLocked === 1) {
          console.log(`[Portfolio] ⊗ Skipping ${walletName} for ${year}-${currentMonth.toString().padStart(2, '0')} (locked)`);
          continue; // Pula meses bloqueados
        }

        const portfolioEntry = {
          userId: "default-user",
          totalValue: brlValue, // Using individual wallet value for now
          month: currentMonth,
          year,
          date: new Date(year, currentMonth - 1, 1).toISOString().split('T')[0]
        };

        await storage.createOrUpdatePortfolioHistory(portfolioEntry);
        console.log(`[Portfolio] Updated ${walletName} projection for ${year}: R$ ${brlValue.toFixed(2)}`);
      } catch (error) {
        console.error(`[Portfolio] Error updating ${walletName} for year ${year}:`, error);
      }
    }
  } catch (error) {
    console.error(`[Portfolio] Error updating portfolio evolution for ${walletName}:`, error);
  }
}

async function updateAssetForWallet(walletName: string, brlValue: number): Promise<void> {
  try {
    // brlValue is already a number in BRL (converted from USD)
    // No need to parse again - just use the numeric value directly

    // Find asset with name matching wallet name (case insensitive) and market crypto or crypto_simplified
    const assets = await storage.getAssets();
    const matchingAsset = assets.find(asset =>
      (asset.market === 'crypto' || asset.market === 'crypto_simplified') &&
      asset.name.toLowerCase() === walletName.toLowerCase()
    );

    if (matchingAsset && brlValue > 0 && matchingAsset.currentPrice !== brlValue) {
      await storage.updateAsset(matchingAsset.id, {
        currentPrice: brlValue,
        lastPriceUpdate: new Date()
      });
      console.log(`[Asset Update] Updated asset ${matchingAsset.name} from ${matchingAsset.currentPrice} to ${brlValue} BRL`);
    }
  } catch (error) {
    console.error(`[Asset Update] Error updating asset for wallet ${walletName}:`, error);
  }
}

export async function syncWalletsToAssets(): Promise<void> {
  try {
    const cache = readCache();
    for (const entry of cache.entries) {
      if (entry.status === 'success') {
        let brlValue = parseCurrencyValue(entry.balance);
        
        // Check if value is in USD and needs conversion
        if (entry.balance.includes('$') || entry.balance.includes(',')) {
          const exchangeRate = await getExchangeRate('USD');
          const usdValue = brlValue;
          brlValue = usdValue * (exchangeRate >= 3.0 && exchangeRate <= 7.0 ? exchangeRate : 5.5);
          console.log(`[Sync] Converted ${entry.walletName}: ${usdValue} USD → ${brlValue.toFixed(2)} BRL`);
        }
        
        if (brlValue > 0) {
          await updateAssetForWallet(entry.walletName, brlValue);
        }
      }
    }
    console.log(`[Sync] Synchronized wallets to assets`);
  } catch (error) {
    console.error('[Sync] Error synchronizing wallets to assets:', error);
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
        // Call platform-specific scraper with explicit timeout
        const result = await Promise.race([
          selectAndScrapePlatform(browser || null, wallet.link, wallet.name),
          new Promise<any>((_, reject) => 
            setTimeout(() => reject(new Error('Platform scraper timeout')), timeoutMs - 1000)
          )
        ]).catch(err => ({
          success: false,
          value: null,
          platform: 'unknown',
          error: err instanceof Error ? err.message : 'Scraper failed'
        }));
        
        if (completed) return; // Already resolved by timeout
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
          // Try fallback: cache primeiro, depois histórico
          const cached = balanceCache.get(wallet.name);
          let fallbackValue = cached?.lastKnownValue;
          
          // Se não tem cache, tenta buscar último maior valor do histórico
          if (!fallbackValue) {
            fallbackValue = getLastHighestValue(wallet.name);
          }
          
          if (fallbackValue) {
            console.log(`[Main] Scrape failed, using fallback: ${fallbackValue}`);
            addCacheEntry(wallet.name, fallbackValue, result.platform, 'temporary_error');
            
            resolve({
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: fallbackValue,
              lastUpdated: cached?.lastUpdated || new Date(),
              status: 'temporary_error',
              lastKnownValue: fallbackValue,
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
        if (completed) return;
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Main] Unhandled error: ${msg}`);
        
        const cached = balanceCache.get(wallet.name);
        let fallbackValue = cached?.lastKnownValue || getLastHighestValue(wallet.name);
        
        if (fallbackValue) {
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: fallbackValue,
            lastUpdated: cached?.lastUpdated || new Date(),
            status: 'temporary_error',
            lastKnownValue: fallbackValue,
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
    executeScrap().catch(err => {
      if (!completed) {
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        console.error(`[Main] ExecuteScrap error: ${err}`);
        resolve({
          id: wallet.id,
          name: wallet.name,
          link: wallet.link,
          balance: 'Indisponível',
          lastUpdated: new Date(),
          status: 'unavailable',
          error: 'Execution failed'
        });
      }
    });
    
    timeoutHandle = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.log(`[Main] Timeout for ${wallet.name}, using fallback`);
        
        const cached = balanceCache.get(wallet.name);
        let fallbackValue = cached?.lastKnownValue || getLastHighestValue(wallet.name);
        
        if (fallbackValue) {
          addCacheEntry(wallet.name, fallbackValue, 'unknown', 'temporary_error');
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: fallbackValue,
            lastUpdated: cached?.lastUpdated || new Date(),
            status: 'temporary_error',
            lastKnownValue: fallbackValue,
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
// SEQUENTIAL WALLET UPDATE
// ============================================================================

// ============================================================================

async function updatePortfolioEvolutionTotal(userId: string = "default-user"): Promise<void> {
  try {
    // Calculate total value from all wallets in cache
    let totalValue = 0;
    const walletNames = new Set(WALLETS.map(w => w.name));

    for (const [walletName, balance] of balanceCache) {
      if (walletNames.has(walletName) && balance.status === 'success' && balance.balance) {
        const numValue = parseCurrencyValue(balance.balance);
        if (numValue > 0) {
          totalValue += numValue;
        }
      }
    }

    if (totalValue === 0) {
      console.log(`[Portfolio Total] No valid wallet values found, skipping portfolio evolution update`);
      return;
    }

    console.log(`[Portfolio Total] Updating portfolio evolution with total value: R$ ${totalValue.toFixed(2)}`);

    // Get current date info
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    // Update portfolio history for future years (2025-2030) with total portfolio value
    // IMPORTANTE: Só atualiza meses NÃO bloqueados
    for (let year = 2025; year <= 2030; year++) {
      try {
        // Verifica se o mês está bloqueado antes de atualizar
        const existingSnapshot = await storage.getMonthlyPortfolioSnapshot(userId, currentMonth, year);
        
        if (existingSnapshot && existingSnapshot.isLocked === 1) {
          console.log(`[Portfolio Total] ⊗ Skipping ${year}-${currentMonth.toString().padStart(2, '0')} (locked)`);
          continue; // Pula meses bloqueados
        }

        const portfolioEntry = {
          userId,
          totalValue,
          month: currentMonth,
          year,
          date: new Date(year, currentMonth - 1, 1).toISOString().split('T')[0]
        };

        await storage.createOrUpdatePortfolioHistory(portfolioEntry);
        console.log(`[Portfolio Total] ✓ Updated portfolio projection for ${year}-${currentMonth.toString().padStart(2, '0')}: R$ ${totalValue.toFixed(2)}`);
      } catch (error) {
        console.error(`[Portfolio Total] ✗ Error updating portfolio for year ${year}:`, error);
      }
    }

    console.log(`[Portfolio Total] ✓ Portfolio evolution update completed`);
  } catch (error) {
    console.error(`[Portfolio Total] ✗ Error updating portfolio evolution:`, error);
  }
}

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
      
      let validValue = false;
      let attempts = 0;
      const maxAttempts = 2; // Reduzido de 3 para 2
      let finalBalance: WalletBalance | null = null;
      
      // Retry logic: if value is 0 or invalid, wait 5 seconds and try again
      while (!validValue && attempts < maxAttempts) {
        attempts++;
        console.log(`[Sequential] Attempt ${attempts}/${maxAttempts} for ${wallet.name}`);
        
        try {
          // Timeouts reduzidos para melhorar performance
          const balance = await scrapeWalletWithTimeout(
            browser,
            wallet,
            wallet.link.includes('debank.com') ? 45000 : 35000
          ).catch(err => {
            console.error(`[Sequential] Scrape error caught: ${err}`);
            // Retorna valor padrão em caso de erro
            return {
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: 'Indisponível',
              lastUpdated: new Date(),
              status: 'unavailable' as const,
              error: 'Scrape failed'
            };
          });
          
          // Validate the scraped value - must not be 0, null, undefined, or empty
          if (balance.status === 'success' && balance.balance) {
            const usdValue = parseCurrencyValue(balance.balance);

            if (usdValue > 0) {
              console.log(`[Sequential] Valid value found: ${balance.balance} (parsed as ${usdValue} USD)`);

              // Convert USD to BRL using REAL exchange rate (never assume 1:1 parity)
              // Always fetch current USD/BRL rate from exchange rate service
              let brlValue = usdValue;
              let isUSD = false;

              // Detect USD values: either contains '$' or has thousand separator (indicating US format)
              if (balance.balance.includes('$') || balance.balance.includes(',')) {
                isUSD = true;
              }

              if (isUSD) {
                // Value is in USD - convert to BRL
                const exchangeRate = await getExchangeRate('USD');

                // Validate exchange rate is reasonable (between 3.0 and 7.0 BRL per USD)
                if (exchangeRate < 3.0 || exchangeRate > 7.0) {
                  console.error(`[Sequential] Invalid exchange rate: ${exchangeRate} - using fallback 5.5`);
                  brlValue = usdValue * 5.5;
                } else {
                  brlValue = usdValue * exchangeRate;
                }

                console.log(`[Sequential] Converted ${usdValue} USD × ${exchangeRate.toFixed(4)} = ${brlValue.toFixed(2)} BRL`);
              } else {
                // Value appears to already be in BRL
                brlValue = usdValue;
                console.log(`[Sequential] Value ${usdValue} assumed to be already in BRL`);
              }

              // Update balance with numeric BRL value (no formatting)
              balance.balance = brlValue.toString();

              // CRITICAL FIX: Persist converted BRL value to cache file
              // Without this, syncWalletsToAssets reads unconverted USD values
              addCacheEntry(wallet.name, balance.balance, 'debank', 'success');

              // Update cache and mark as valid
              balanceCache.set(wallet.name, balance);
              validValue = true;
              finalBalance = balance;

              // Update corresponding asset if balance was successfully retrieved
              await updateAssetForWallet(wallet.name, brlValue);

              break;
            } else {
              console.log(`[Sequential] Invalid value (0 or negative): ${balance.balance} - will retry`);
            }
          } else {
            console.log(`[Sequential] Scrape failed or returned invalid status: ${balance.status}`);
          }
          
          // If value is invalid and we have more attempts, wait 5 seconds
          if (!validValue && attempts < maxAttempts) {
            console.log(`[Sequential] Waiting 5 seconds before retry...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
          
        } catch (error) {
          console.error(`[Sequential] Error processing ${wallet.name}:`, error);
          
          // If we have cached value, use it as fallback
          const cached = balanceCache.get(wallet.name);
          if (cached?.lastKnownValue && attempts === maxAttempts) {
            console.log(`[Sequential] Using cached value as fallback: ${cached.lastKnownValue}`);
            finalBalance = {
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: cached.lastKnownValue,
              lastUpdated: cached.lastUpdated,
              status: 'temporary_error',
              lastKnownValue: cached.lastKnownValue,
              error: 'Using cached value'
            };
            balanceCache.set(wallet.name, finalBalance);
            validValue = true;
          }
          
          // If error and we have more attempts, wait 5 seconds
          if (!validValue && attempts < maxAttempts) {
            console.log(`[Sequential] Waiting 5 seconds before retry after error...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }
      
      // If still no valid value after all attempts, use fallback with historical data
      if (!validValue) {
        console.log(`[Sequential] Failed to get valid value for ${wallet.name} after ${maxAttempts} attempts`);
        const cached = balanceCache.get(wallet.name);
        const historicalValue = cached?.lastKnownValue || getLastHighestValue(wallet.name);
        
        if (historicalValue) {
          console.log(`[Sequential] Using historical fallback value: ${historicalValue}`);
          finalBalance = {
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: historicalValue,
            lastUpdated: cached?.lastUpdated || new Date(),
            status: 'temporary_error',
            lastKnownValue: historicalValue,
            error: 'Usando valor histórico'
          };
        } else {
          finalBalance = {
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: 'Indisponível',
            lastUpdated: new Date(),
            status: 'unavailable',
            error: 'Falha após múltiplas tentativas'
          };
        }
        balanceCache.set(wallet.name, finalBalance);
      }
      
      console.log(`[Sequential] Final result for ${wallet.name}: ${finalBalance?.balance} (${finalBalance?.status})`);
      
      // 5 second delay between wallets (reduzido de 10s)
      if (i < wallets.length - 1) {
        console.log(`[Sequential] Waiting 5 seconds before next wallet...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    // Update portfolio evolution with total value after all wallets are processed
    await updatePortfolioEvolutionTotal();

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

export async function getDetailedBalances(): Promise<WalletBalance[]> {
  const walletNames = new Set(WALLETS.map(w => w.name));
  // Ensure all wallets have at least their last highest valid value
  const balances = Array.from(balanceCache.values()).filter(balance => walletNames.has(balance.name)).map(async wallet => {
    // If balance is "Carregando..." or "Indisponível", try to use last highest valid value from history
    if ((wallet.balance === "Carregando..." || wallet.balance === "Indisponível") || wallet.status !== 'success') {
      const lastHighestValue = getLastHighestValue(wallet.name);
      if (lastHighestValue) {
        // Convert value to BRL if needed
        const numValue = parseCurrencyValue(lastHighestValue);
        let brlValue = numValue;
        
        // Check if value is in USD (contains $ or comma separator)
        if (lastHighestValue.includes('$') || lastHighestValue.includes(',')) {
          const exchangeRate = await getExchangeRate('USD');
          brlValue = numValue * (exchangeRate >= 3.0 && exchangeRate <= 7.0 ? exchangeRate : 5.5);
          console.log(`[getDetailedBalances] Converted ${wallet.name}: ${numValue} USD → ${brlValue.toFixed(2)} BRL`);
        }
        
        return {
          ...wallet,
          balance: brlValue.toString(),
          status: 'temporary_error' as const,
          lastKnownValue: brlValue.toString()
        };
      }
      // Fallback to lastKnownValue if no history found
      if (wallet.lastKnownValue) {
        // Convert value to BRL if needed
        const numValue = parseCurrencyValue(wallet.lastKnownValue);
        let brlValue = numValue;
        
        // Check if value is in USD (contains $ or comma separator)
        if (wallet.lastKnownValue.includes('$') || wallet.lastKnownValue.includes(',')) {
          const exchangeRate = await getExchangeRate('USD');
          brlValue = numValue * (exchangeRate >= 3.0 && exchangeRate <= 7.0 ? exchangeRate : 5.5);
          console.log(`[getDetailedBalances] Converted ${wallet.name} (fallback): ${numValue} USD → ${brlValue.toFixed(2)} BRL`);
        }
        
        return {
          ...wallet,
          balance: brlValue.toString(),
          status: 'temporary_error' as const,
        };
      }
    }
    return wallet;
  });
  return await Promise.all(balances);
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
  
  // Marca todas as wallets como "em atualização"
  for (const wallet of WALLETS) {
    const cached = balanceCache.get(wallet.name);
    const fallbackValue = cached?.lastKnownValue || getLastHighestValue(wallet.name);
    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: fallbackValue || 'Carregando...',
      lastUpdated: new Date(),
      status: fallbackValue ? 'temporary_error' : 'unavailable',
      lastKnownValue: fallbackValue
    });
  }
  
  // Aguarda atualização completa com timeout de segurança
  try {
    await Promise.race([
      updateWalletsSequentially(WALLETS),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Update timeout')), 300000) // 5 minutos max
      )
    ]);
  } catch (error) {
    console.error('[Force] Update timeout or error:', error);
  }
  
  return await getDetailedBalances();
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
      let brlValue = parseCurrencyValue(balance.balance);
      
      // Check if value is in USD and needs conversion
      if (balance.balance.includes('$') || balance.balance.includes(',')) {
        const exchangeRate = await getExchangeRate('USD');
        const usdValue = brlValue;
        brlValue = usdValue * (exchangeRate >= 3.0 && exchangeRate <= 7.0 ? exchangeRate : 5.5);
        console.log(`[forceRefreshWallet] Converted ${wallet.name}: ${usdValue} USD → ${brlValue.toFixed(2)} BRL`);
        
        // Update balance with BRL value
        balance.balance = brlValue.toString();
        balanceCache.set(wallet.name, balance);
      }
      
      await updateAssetForWallet(wallet.name, brlValue);
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
  return await getDetailedBalances();
}
