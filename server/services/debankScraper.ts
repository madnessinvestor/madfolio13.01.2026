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
  for (const [name] of Array.from(balanceCache.entries())) {
    if (!newNames.has(name)) {
      balanceCache.delete(name);
    }
  }
}

const balanceCache = new Map<string, WalletBalance>();
let refreshInterval: NodeJS.Timeout | null = null;

// 🕒 Controle de frequência: rastrear última atualização de cada wallet
const lastWalletUpdate = new Map<string, number>();
const MIN_WALLET_UPDATE_INTERVAL = 60 * 1000; // 1 minuto entre atualizações da MESMA wallet
const INTER_WALLET_DELAY = 20 * 1000; // 20 segundos entre wallets diferentes

// Controle de concorrência: garantir que apenas 1 browser esteja ativo por vez
let isRefreshing = false;
let refreshQueue: Array<() => Promise<void>> = [];
let currentBrowser: Browser | null = null; // Referência global para browser ativo
let activeScrapers: Set<string> = new Set(); // Rastrear scrapers ativos

// ============================================================================
// RESET COMPLETO DO ESTADO INTERNO
// ============================================================================

/**
 * Reset completo do estado interno do Wallet Tracker
 * Deve ser chamado:
 * - Após falha sistêmica (várias wallets falhando)
 * - Antes de "Atualizar Agora" manual
 * - Quando sistema entrar em estado inválido
 */
async function resetWalletTrackerState(): Promise<void> {
  console.log('[Reset] ⚠️ Iniciando reset completo do estado interno do Wallet Tracker');
  
  try {
    // 1. Cancelar todas as execuções pendentes
    if (currentBrowser) {
      console.log('[Reset] Fechando browser ativo...');
      try {
        await currentBrowser.close().catch(() => {});
        console.log('[Reset] ✓ Browser fechado');
      } catch (e) {
        console.log('[Reset] Browser já estava fechado');
      }
      currentBrowser = null;
    }
    
    // 2. Limpar completamente a fila de wallets
    refreshQueue = [];
    console.log('[Reset] ✓ Fila de refresh limpa');
    
    // 3. Resetar estados internos
    isRefreshing = false;
    activeScrapers.clear();
    console.log('[Reset] ✓ Estados internos resetados');
    
    // 4. Limpar timestamps para permitir atualização imediata
    lastWalletUpdate.clear();
    console.log('[Reset] ✓ Timestamps limpos');
    
    // 5. Para cada wallet no cache:
    //    - Se tem valor válido: mantém
    //    - Se está em estado inválido: reseta para tentar novamente
    for (const [walletName, balance] of Array.from(balanceCache.entries())) {
      if (balance.status !== 'success') {
        // Wallet em estado de erro - preparar para nova tentativa
        const historicalValue = getLastHighestValue(walletName);
        const fallbackValue = balance.lastKnownValue || historicalValue;
        
        if (fallbackValue) {
          balanceCache.set(walletName, {
            ...balance,
            balance: fallbackValue,
            status: 'temporary_error',
            lastKnownValue: fallbackValue,
            error: 'Sistema resetado - pronto para nova tentativa'
          });
          console.log(`[Reset] ${walletName}: mantido valor histórico ${fallbackValue}`);
        } else {
          balanceCache.set(walletName, {
            ...balance,
            balance: 'Aguardando',
            status: 'temporary_error',
            error: 'Sistema resetado - aguardando primeira extração'
          });
          console.log(`[Reset] ${walletName}: resetado para aguardando`);
        }
      }
    }
    
    console.log('[Reset] ✓ Reset completo finalizado com sucesso');
  } catch (error) {
    console.error('[Reset] Erro durante reset:', error);
  }
}

async function processRefreshQueue() {
  if (refreshQueue.length === 0) {
    isRefreshing = false;
    return;
  }
  
  const nextRefresh = refreshQueue.shift();
  if (nextRefresh) {
    try {
      await nextRefresh();
    } catch (error) {
      console.error('[Queue] Error processing refresh:', error);
    }
    // Processar próximo da fila após 2 segundos
    setTimeout(() => processRefreshQueue(), 2000);
  } else {
    isRefreshing = false;
  }
}

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
          // Tratamento especial para "Browser not available" - usar fallback imediatamente
          const isBrowserUnavailable = result.error?.includes('Browser not available');
          
          if (isBrowserUnavailable) {
            console.log(`[Main] Browser not available for ${wallet.name}, using fallback immediately`);
          }
          
          // Try fallback: cache primeiro, depois histórico
          const cached = balanceCache.get(wallet.name);
          let fallbackValue = cached?.lastKnownValue;
          
          // Se não tem cache, tenta buscar último maior valor do histórico
          if (!fallbackValue) {
            const historicalValue = getLastHighestValue(wallet.name);
            if (historicalValue) {
              fallbackValue = historicalValue;
            }
          }
          
          if (fallbackValue) {
            console.log(`[Main] Scrape failed${isBrowserUnavailable ? ' (browser unavailable)' : ''}, using fallback: ${fallbackValue}`);
            // ✅ Fallback já está no histórico, NÃO salvar novamente para não marcar como indisponível
            // Apenas retornar o valor em cache sem persistir falha temporária
            
            resolve({
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: fallbackValue,
              lastUpdated: cached?.lastUpdated || new Date(),
              status: 'temporary_error',
              lastKnownValue: fallbackValue,
              error: result.error || 'Scrape failed - using last known value'
            });
          } else {
            // ⚠️ SÓ marca como indisponível se REALMENTE não tem nenhum valor histórico
            // e MESMO ASSIM, não salva no cache para não persistir o estado inválido
            console.log(`[Main] Scrape failed with no historical data available: ${result.error}`);
            
            resolve({
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: 'Carregando...',  // Melhor que "Indisponível" - indica que vai tentar novamente
              lastUpdated: new Date(),
              status: 'temporary_error',  // Mudado de 'unavailable' para 'temporary_error'
              error: result.error || 'Aguardando primeira extração bem-sucedida'
            });
          }
        }
      } catch (error) {
        if (completed) return;
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        const msg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[Main] Unhandled error for ${wallet.name}: ${msg}`);
        
        const cached = balanceCache.get(wallet.name);
        let fallbackValue = cached?.lastKnownValue || getLastHighestValue(wallet.name);
        
        if (fallbackValue) {
          console.log(`[Main] Using fallback after error: ${fallbackValue}`);
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
          // Não marca como indisponível - apenas como erro temporário
          console.log(`[Main] Error with no historical data - will retry next cycle`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: 'Carregando...',
            lastUpdated: new Date(),
            status: 'temporary_error',
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
        console.error(`[Main] ExecuteScrap error for ${wallet.name}: ${err}`);
        
        // Tentar fallback mesmo em caso de erro crítico
        const cached = balanceCache.get(wallet.name);
        const fallbackValue = cached?.lastKnownValue || getLastHighestValue(wallet.name);
        
        if (fallbackValue) {
          console.log(`[Main] Using fallback after execution error: ${fallbackValue}`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: fallbackValue,
            lastUpdated: cached?.lastUpdated || new Date(),
            status: 'temporary_error',
            lastKnownValue: fallbackValue,
            error: 'Execution error - using last known value'
          });
        } else {
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: 'Carregando...',
            lastUpdated: new Date(),
            status: 'temporary_error',
            error: 'Execution failed - will retry next cycle'
          });
        }
      }
    });
    
    timeoutHandle = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.log(`[Main] Timeout for ${wallet.name}, using fallback`);
        
        const cached = balanceCache.get(wallet.name);
        const historicalValue = getLastHighestValue(wallet.name);
        let fallbackValue = cached?.lastKnownValue || (historicalValue ? historicalValue : undefined);
        
        if (fallbackValue) {
          // ✅ Fallback já está no histórico, não salvar novamente
          console.log(`[Main] Using fallback after timeout: ${fallbackValue}`);
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
          // ⚠️ NÃO marcar como indisponível - apenas como carregando para tentar novamente
          console.log(`[Main] Timeout with no historical data - will retry next cycle`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: 'Carregando...',
            lastUpdated: new Date(),
            status: 'temporary_error',
            error: 'Timeout - will retry on next sync'
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

    for (const [walletName, balance] of Array.from(balanceCache.entries())) {
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
    
    try {
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
      
      // Rastrear browser globalmente para permitir cancelamento
      currentBrowser = browser;
      console.log('[Sequential] Browser lançado e rastreado');
    } catch (browserLaunchError) {
      console.error('[Sequential] Browser launch failed:', browserLaunchError);
      console.log('[Sequential] Browser not available - will use fallback values for all wallets');
      browser = null;
      currentBrowser = null;
    }

    console.log(`[Sequential] Processing ${wallets.length} wallets sequentially`);
    
    // Contador de falhas consecutivas para abortar ciclo em massa
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3; // Abortar se 3 wallets falharem consecutivamente
    let totalFailures = 0;
    let successCount = 0;
    
    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      console.log(`[Sequential] Wallet ${i + 1}/${wallets.length}: ${wallet.name}`);
      
      // Verificar se sistema está sendo resetado
      if (!isRefreshing && currentBrowser === null && browser !== null) {
        console.log('[Sequential] ⚠️ Sistema resetado externamente - abortando ciclo');
        break;
      }
      
      // Rastrear scraper ativo
      activeScrapers.add(wallet.name);
      
      // 🕒 Verificar se passou tempo mínimo desde última atualização desta wallet
      const lastUpdate = lastWalletUpdate.get(wallet.name) || 0;
      const timeSinceLastUpdate = Date.now() - lastUpdate;
      
      if (timeSinceLastUpdate < MIN_WALLET_UPDATE_INTERVAL) {
        const remainingTime = Math.ceil((MIN_WALLET_UPDATE_INTERVAL - timeSinceLastUpdate) / 1000);
        console.log(`[Sequential] ⏸️ Skipping ${wallet.name} - updated ${Math.ceil(timeSinceLastUpdate / 1000)}s ago (min interval: 60s, remaining: ${remainingTime}s)`);
        
        // Usar valor do cache
        const cached = balanceCache.get(wallet.name);
        if (cached) {
          console.log(`[Sequential] Using cached value for ${wallet.name}: ${cached.balance}`);
        }
        
        activeScrapers.delete(wallet.name);
        continue; // Pular para próxima wallet
      }
      
      // Se já temos muitas falhas consecutivas, abortar o ciclo e resetar estado
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.log(`[Sequential] ⚠️ Abortando ciclo: ${consecutiveFailures} falhas consecutivas detectadas`);
        console.log(`[Sequential] ⚠️ Isso indica problemas internos, não problemas dos sites externos`);
        console.log(`[Sequential] ⚠️ Resetando sistema para recuperação...`);
        
        // Resetar estado antes de abortar
        await resetWalletTrackerState();
        break;
      }
      
      let validValue = false;
      let attempts = 0;
      const maxAttempts = 1; // Apenas 1 tentativa - não insistir se falhar
      let finalBalance: WalletBalance | null = null;
      
      // Retry logic: apenas 1 tentativa por wallet para evitar loops
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
              consecutiveFailures = 0; // Reset contador quando tiver sucesso
              successCount++; // Incrementar contador de sucessos
              finalBalance = balance;
              
              // ✅ Registrar timestamp desta atualização
              lastWalletUpdate.set(wallet.name, Date.now());

              // Update corresponding asset if balance was successfully retrieved
              await updateAssetForWallet(wallet.name, brlValue);

              break;
            } else {
              console.log(`[Sequential] Invalid value (0 or negative): ${balance.balance} - will retry`);
            }
          } else {
            console.log(`[Sequential] Scrape failed or returned invalid status: ${balance.status}`);
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
          
          // If error and we have more attempts, wait 10 seconds
          if (!validValue && attempts < maxAttempts) {
            console.log(`[Sequential] Waiting 10 seconds before retry after error...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
          }
        }
      }
      
      // If still no valid value after all attempts, use fallback with historical data
      if (!validValue) {
        consecutiveFailures++; // Incrementar contador de falhas
        totalFailures++; // Incrementar contador total de falhas
        console.log(`[Sequential] Failed to get valid value for ${wallet.name} after ${maxAttempts} attempts (consecutive: ${consecutiveFailures}, total: ${totalFailures})`);
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
          // NÃO marcar como "Indisponível" - usar "Aguardando" para indicar que vai tentar novamente
          console.log(`[Sequential] No historical value - marking as awaiting retry`);
          finalBalance = {
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: 'Aguardando',
            lastUpdated: new Date(),
            status: 'temporary_error',
            error: 'Aguardando próxima tentativa'
          };
        }
        balanceCache.set(wallet.name, finalBalance);
      }
      
      console.log(`[Sequential] Final result for ${wallet.name}: ${finalBalance?.balance} (${finalBalance?.status})`);
      
      // Remover scraper do set de ativos
      activeScrapers.delete(wallet.name);
      
      // 🕒 20 segundos entre wallets diferentes (para respeitar rate limits e permitir carregamento completo)
      if (i < wallets.length - 1) {
        console.log(`[Sequential] Waiting 20 seconds before next wallet...`);
        await new Promise(resolve => setTimeout(resolve, INTER_WALLET_DELAY));
      }
    }
    
    // Logging de estatísticas finais
    console.log(`[Sequential] ✓ Ciclo finalizado: ${successCount} sucessos, ${totalFailures} falhas`);
    
    // Se teve muitas falhas totais (>50%), considerar reset
    if (wallets.length > 0 && totalFailures / wallets.length > 0.5) {
      console.log(`[Sequential] ⚠️ Alta taxa de falhas detectada (${Math.round(totalFailures / wallets.length * 100)}%)`);
      console.log(`[Sequential] Sistema pode estar em estado degradado - considerar reset manual se persistir`);
    }

    // Update portfolio evolution with total value after all wallets are processed
    await updatePortfolioEvolutionTotal();

    // Sync consolidated portfolio evolution from all sources
    try {
      const { syncPortfolioEvolution } = await import('./portfolioSync');
      await syncPortfolioEvolution("default-user");
    } catch (error) {
      console.error('[Sequential] Error syncing portfolio evolution:', error);
    }

  } catch (error) {
    console.error(`[Sequential] Error:`, error);
    // Em caso de erro crítico, resetar estado
    console.log('[Sequential] Erro crítico - iniciando reset de segurança');
    await resetWalletTrackerState();
  } finally {
    // Limpar scrapers ativos
    activeScrapers.clear();
    
    // Garantir fechamento do browser em qualquer situação
    if (browser) {
      try {
        await browser.close().catch(err => {
          console.log('[Sequential] Browser close warning:', err?.message || 'unknown');
        });
        console.log('[Sequential] Browser closed successfully');
      } catch (e) {
        console.log('[Sequential] Browser was already closed or unavailable');
      }
    }
    
    // Limpar referência global
    currentBrowser = null;
    console.log('[Sequential] ✓ Referência global de browser limpa');
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
  console.log('[Force] 🔄 Atualização manual solicitada - forçando reset completo');
  
  // STEP 1: Reset completo do estado interno
  await resetWalletTrackerState();
  
  // STEP 2: Aguardar 2 segundos para garantir que tudo foi limpo
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // STEP 3: Marca todas as wallets como "em atualização" com valores históricos
  for (const wallet of WALLETS) {
    const cached = balanceCache.get(wallet.name);
    const historicalValue = getLastHighestValue(wallet.name);
    const fallbackValue = cached?.lastKnownValue || (historicalValue ? historicalValue : undefined);
    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: fallbackValue || 'Atualizando...',
      lastUpdated: new Date(),
      status: fallbackValue ? 'temporary_error' : 'temporary_error',
      lastKnownValue: fallbackValue,
      error: 'Atualização manual em andamento'
    });
  }
  
  // STEP 4: Aguardar atualização completa com timeout de segurança
  try {
    await Promise.race([
      updateWalletsSequentially(WALLETS),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Update timeout')), 300000) // 5 minutos max
      )
    ]);
  } catch (error) {
    console.error('[Force] Update timeout ou erro:', error);
    console.log('[Force] Resetando sistema após timeout...');
    await resetWalletTrackerState();
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
    
    // Em caso de erro, tentar usar valor do cache
    const cached = balanceCache.get(walletName);
    if (cached?.lastKnownValue) {
      console.log(`[Force] Using cached value after error: ${cached.lastKnownValue}`);
      return cached;
    }
    return null;
  } finally {
    // Garantir fechamento do browser em qualquer situação
    if (browser) {
      try {
        await browser.close().catch(err => {
          console.log('[Force] Browser close warning:', err?.message || 'unknown');
        });
        console.log('[Force] Browser closed successfully');
      } catch (e) {
        console.log('[Force] Browser was already closed or unavailable');
      }
    }
  }
}

export async function forceRefresh(): Promise<WalletBalance[]> {
  console.log('[Force] 🔄 Refresh iniciado');
  
  // Se já está processando, resetar e tentar novamente
  if (isRefreshing) {
    console.log('[Force] Sistema ocupado - resetando estado e tentando novamente');
    await resetWalletTrackerState();
    // Aguardar 1 segundo antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Marca como em processamento e inicia
  isRefreshing = true;
  updateWalletsSequentially(WALLETS).finally(() => {
    isRefreshing = false;
    setTimeout(() => processRefreshQueue(), 2000);
  });
  
  return await getDetailedBalances();
}
