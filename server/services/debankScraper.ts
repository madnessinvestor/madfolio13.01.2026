import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser } from "puppeteer";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  addCacheEntry,
  getLastValidBalance,
  createInitialHistoryEntry,
} from "./walletCache";
import { selectAndScrapePlatform } from "./platformScrapers";
import { storage } from "../storage";
import { readCache } from "./walletCache";
import { convertToBRL, getExchangeRate } from "./exchangeRate";
import {
  loadHistoryFromFile,
  saveHistoryToFile,
  syncToGitHub,
  pullFromGitHub,
  type WalletHistoryEntry,
} from "./walletHistorySync";

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
  if (!value || typeof value !== "string") return 0;

  try {
    // Remove currency symbols and spaces from the beginning
    let cleanValue = value.replace(/^[$\s]+/, "").trim();

    // Handle different formats
    if (cleanValue.includes(",") && cleanValue.includes(".")) {
      // Format like "1,234.56" - comma is thousands separator, dot is decimal
      cleanValue = cleanValue.replace(/,/g, "");
    } else if (cleanValue.includes(",")) {
      // Format like "54,188" - comma is thousands separator
      cleanValue = cleanValue.replace(/,/g, "");
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
  status: "success" | "temporary_error" | "unavailable";
  lastKnownValue?: string;
}

async function updatePortfolioEvolution(
  walletName: string,
  brlValue: number
): Promise<void> {
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
        const existingSnapshot = await storage.getMonthlyPortfolioSnapshot(
          "default-user",
          currentMonth,
          year
        );

        if (existingSnapshot && existingSnapshot.isLocked === 1) {
          console.log(
            `[Portfolio] ⊗ Skipping ${walletName} for ${year}-${currentMonth
              .toString()
              .padStart(2, "0")} (locked)`
          );
          continue; // Pula meses bloqueados
        }

        const portfolioEntry = {
          userId: "default-user",
          totalValue: brlValue, // Using individual wallet value for now
          month: currentMonth,
          year,
          date: new Date(year, currentMonth - 1, 1).toISOString().split("T")[0],
        };

        await storage.createOrUpdatePortfolioHistory(portfolioEntry);
        console.log(
          `[Portfolio] Updated ${walletName} projection for ${year}: R$ ${brlValue.toFixed(
            2
          )}`
        );
      } catch (error) {
        console.error(
          `[Portfolio] Error updating ${walletName} for year ${year}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error(
      `[Portfolio] Error updating portfolio evolution for ${walletName}:`,
      error
    );
  }
}

async function updateAssetForWallet(
  walletName: string,
  brlValue: number
): Promise<void> {
  try {
    // brlValue is already a number in BRL (converted from USD)
    // No need to parse again - just use the numeric value directly

    // Find asset with name matching wallet name (case insensitive) and market crypto or crypto_simplified
    const assets = await storage.getAssets();
    const matchingAsset = assets.find(
      (asset) =>
        (asset.market === "crypto" || asset.market === "crypto_simplified") &&
        asset.name.toLowerCase() === walletName.toLowerCase()
    );

    if (
      matchingAsset &&
      brlValue > 0 &&
      matchingAsset.currentPrice !== brlValue
    ) {
      await storage.updateAsset(matchingAsset.id, {
        currentPrice: brlValue,
        lastPriceUpdate: new Date(),
      });
      console.log(
        `[Asset Update] Updated asset ${matchingAsset.name} from ${matchingAsset.currentPrice} to ${brlValue} BRL`
      );
    }
  } catch (error) {
    console.error(
      `[Asset Update] Error updating asset for wallet ${walletName}:`,
      error
    );
  }
}

export async function syncWalletsToAssets(): Promise<void> {
  try {
    const cache = readCache();
    for (const entry of cache.entries) {
      if (entry.status === "success") {
        let brlValue = parseCurrencyValue(entry.balance);

        // Check if value is in USD and needs conversion
        if (entry.balance.includes("$") || entry.balance.includes(",")) {
          const exchangeRate = await getExchangeRate("USD");
          const usdValue = brlValue;
          brlValue =
            usdValue *
            (exchangeRate >= 3.0 && exchangeRate <= 7.0 ? exchangeRate : 5.5);
          console.log(
            `[Sync] Converted ${
              entry.walletName
            }: ${usdValue} USD → ${brlValue.toFixed(2)} BRL`
          );
        }

        if (brlValue > 0) {
          await updateAssetForWallet(entry.walletName, brlValue);
        }
      }
    }
    console.log(`[Sync] Synchronized wallets to assets`);
  } catch (error) {
    console.error("[Sync] Error synchronizing wallets to assets:", error);
  }
}

export function setWallets(newWallets: WalletConfig[]): void {
  WALLETS = newWallets;
  // Clean balanceCache to remove deleted wallets
  const newNames = new Set(newWallets.map((w) => w.name));
  for (const [name] of Array.from(balanceCache.entries())) {
    if (!newNames.has(name)) {
      balanceCache.delete(name);
    }
  }
}

const balanceCache = new Map<string, WalletBalance>();
let refreshInterval: NodeJS.Timeout | null = null;

// 🆕 Cache do histórico do GitHub
let gitHistoryCache: Map<string, WalletHistoryEntry> = new Map();

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
  console.log(
    "[Reset] ⚠️ Iniciando reset completo do estado interno do Wallet Tracker"
  );

  try {
    // 1. Cancelar todas as execuções pendentes
    if (currentBrowser) {
      console.log("[Reset] Fechando browser ativo...");
      try {
        await currentBrowser.close().catch(() => {});
        console.log("[Reset] ✓ Browser fechado");
      } catch (e) {
        console.log("[Reset] Browser já estava fechado");
      }
      currentBrowser = null;
    }

    // 2. Limpar completamente a fila de wallets
    refreshQueue = [];
    console.log("[Reset] ✓ Fila de refresh limpa");

    // 3. Resetar estados internos
    isRefreshing = false;
    activeScrapers.clear();
    console.log("[Reset] ✓ Estados internos resetados");

    // 4. Limpar timestamps para permitir atualização imediata
    lastWalletUpdate.clear();
    console.log("[Reset] ✓ Timestamps limpos");

    // 5. Para cada wallet no cache:
    //    - Se tem valor válido: mantém
    //    - Se está em estado inválido: reseta para tentar novamente
    for (const [walletName, balance] of Array.from(balanceCache.entries())) {
      if (balance.status !== "success") {
        // Wallet em estado de erro - preparar para nova tentativa
        const lastValidEntry = getLastValidBalance(walletName);
        let fallbackValue = lastValidEntry?.balance;

        if (!fallbackValue) {
          fallbackValue = balance.lastKnownValue;
        }

        if (fallbackValue) {
          balanceCache.set(walletName, {
            ...balance,
            balance: fallbackValue,
            status: "temporary_error",
            lastKnownValue: fallbackValue,
            error: "Sistema resetado - pronto para nova tentativa",
          });
          console.log(
            `[Reset] ${walletName}: mantido valor histórico ${fallbackValue}`
          );
        } else {
          balanceCache.set(walletName, {
            ...balance,
            balance: "Aguardando",
            status: "temporary_error",
            error: "Sistema resetado - aguardando primeira extração",
          });
          console.log(`[Reset] ${walletName}: resetado para aguardando`);
        }
      }
    }

    console.log("[Reset] ✓ Reset completo finalizado com sucesso");
  } catch (error) {
    console.error("[Reset] Erro durante reset:", error);
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
      console.error("[Queue] Error processing refresh:", error);
    }
    // Processar próximo da fila após 2 segundos
    setTimeout(() => processRefreshQueue(), 2000);
  } else {
    isRefreshing = false;
  }
}

// ============================================================================
// SINCRONIZAÇÃO COM GITHUB
// ============================================================================

// Carregar histórico do GitHub ao iniciar
async function initializeHistory() {
  console.log("[WalletTracker] 🚀 Inicializando histórico...");

  // Tentar fazer pull do GitHub
  await pullFromGitHub();

  // Carregar do arquivo JSON
  gitHistoryCache = loadHistoryFromFile();

  // Sincronizar com cache em memória
  for (const [name, entry] of gitHistoryCache.entries()) {
    balanceCache.set(name, {
      id: entry.id,
      name: entry.name,
      link: "", // Será preenchido quando wallet for configurada
      balance: entry.balance,
      lastUpdated: new Date(entry.lastUpdated),
      status: entry.status as any,
      lastKnownValue: entry.balance,
    });
  }

  console.log(
    `[WalletTracker] ✅ ${gitHistoryCache.size} registros carregados do GitHub`
  );
}

// Salvar no arquivo JSON e sincronizar com GitHub
function syncHistoryToGitHub() {
  try {
    // Converter cache para formato de arquivo
    const historyMap = new Map<string, WalletHistoryEntry>();

    for (const [name, cache] of balanceCache.entries()) {
      if (
        cache.lastKnownValue &&
        cache.lastKnownValue !== "Aguardando" &&
        cache.lastKnownValue !== "Erro"
      ) {
        historyMap.set(name, {
          id: cache.id || name,
          name: name,
          balance: cache.lastKnownValue,
          lastUpdated: cache.lastUpdated.toISOString(),
          status: cache.status,
          platform: "unknown",
        });
      }
    }

    // Salvar no arquivo
    if (saveHistoryToFile(historyMap)) {
      // Sincronizar com GitHub (não aguarda para não bloquear)
      const timestamp = new Date().toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
      syncToGitHub(`Update wallet balances - ${timestamp}`).catch((err) => {
        console.error(
          "[WalletTracker] ⚠️ Erro ao sincronizar com GitHub:",
          err
        );
      });
    }
  } catch (error) {
    console.error("[WalletTracker] ❌ Erro ao sincronizar histórico:", error);
  }
}

// Chromium path detection removed - puppeteer will use its bundled Chromium automatically

// ============================================================================
// MAIN SCRAPING WITH TIMEOUT & FALLBACK
// ============================================================================

async function scrapeWalletWithTimeout(
  browser: Browser | null,
  wallet: WalletConfig,
  timeoutMs: number = 120000
): Promise<WalletBalance> {
  console.log(`[Wallet] 🎯 Scraping ${wallet.name} (timeout: ${timeoutMs}ms)`);

  let timeoutHandle: NodeJS.Timeout | null = null;
  let completed = false;

  return new Promise((resolve) => {
    const executeScrap = async () => {
      try {
        // Call platform-specific scraper with explicit timeout
        const result = await Promise.race([
          selectAndScrapePlatform(browser || null, wallet.link, wallet.name),
          new Promise<any>((_, reject) =>
            setTimeout(
              () => reject(new Error("Platform scraper timeout")),
              timeoutMs - 1000
            )
          ),
        ]).catch((err) => ({
          success: false,
          value: null,
          platform: "unknown",
          error: err instanceof Error ? err.message : "Scraper failed",
        }));

        if (completed) return; // Already resolved by timeout
        completed = true;

        if (timeoutHandle) clearTimeout(timeoutHandle);

        if (result.success && result.value) {
          // 🔄 CONVERSÃO USD → BRL: Garantir que valor esteja sempre em BRL antes de salvar
          let balanceBRL = result.value;
          
          // Se contém "$" ou formato USD, converter para BRL
          if (result.value.includes("$") || /^\d{1,3}(,\d{3})+(\.\d{2})?$/.test(result.value)) {
            try {
              const usdValue = parseFloat(result.value.replace(/[\$,]/g, ""));
              if (!isNaN(usdValue) && usdValue > 0) {
                const exchangeRate = await getExchangeRate("USD");
                const brlValue = usdValue * exchangeRate;
                balanceBRL = brlValue.toFixed(2);
                console.log(`[Wallet] Converted ${result.value} USD → R$ ${balanceBRL} (rate: ${exchangeRate})`);
              }
            } catch (error) {
              console.error(`[Wallet] Error converting ${result.value} to BRL:`, error);
            }
          }
          
          console.log(`[Wallet] ✅ Sucesso: ${wallet.name} = R$ ${balanceBRL}`);

          // Save to cache (já em BRL)
          addCacheEntry(wallet.name, balanceBRL, result.platform, "success");

          // 🆕 SINCRONIZAR COM GITHUB
          syncHistoryToGitHub();

          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: balanceBRL,
            lastUpdated: new Date(),
            status: "success",
            lastKnownValue: balanceBRL,
          });
        } else {
          // 🎯 FLUXO CORRETO: Falha de scraping → consultar banco ANTES de retornar erro
          const isBrowserUnavailable = result.error?.includes(
            "Browser not available"
          );

          if (isBrowserUnavailable) {
            console.log(`[Wallet] ⚠️ Browser indisponível para ${wallet.name}`);
          } else {
            console.log(
              `[Wallet] ⚠️ Falha no scraping: ${wallet.name} - ${result.error}`
            );
          }

          // ✅ SEMPRE consultar histórico do banco PRIMEIRO
          console.log(
            `[Wallet] 💾 Consultando histórico no banco para ${wallet.name}`
          );

          // 🆕 Tentar cache do GitHub primeiro
          const gitEntry = gitHistoryCache.get(wallet.name);
          const lastValidEntry = getLastValidBalance(wallet.name);
          let fallbackValue = gitEntry?.balance || lastValidEntry?.balance;
          let fallbackTimestamp = gitEntry
            ? new Date(gitEntry.lastUpdated)
            : lastValidEntry
            ? new Date(lastValidEntry.timestamp)
            : undefined;

          // Se não tem histórico no arquivo, tenta cache em memória
          if (!fallbackValue) {
            const cached = balanceCache.get(wallet.name);
            fallbackValue = cached?.lastKnownValue;
            fallbackTimestamp = cached?.lastUpdated;
          }

          if (fallbackValue) {
            console.log(`[Wallet] 💾 Usando valor em cache: ${fallbackValue}`);

            // ✅ CORREÇÃO: Status DEVE ser 'success' quando há histórico válido
            // Falha de browser não é erro funcional quando há dados salvos
            resolve({
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: fallbackValue,
              lastUpdated: fallbackTimestamp || new Date(),
              status: "success", // ✅ Status OK quando usa histórico
              lastKnownValue: fallbackValue,
              error: undefined, // ✅ Sem erro quando há histórico
            });
          } else {
            // ⚠️ APENAS AQUI: NENHUM registro no banco - primeira coleta
            console.log(
              `[Wallet] ❌ Sem histórico para ${wallet.name} - aguardando primeira coleta`
            );

            resolve({
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: "Aguardando",
              lastUpdated: new Date(),
              status: "temporary_error",
              error: "Aguardando primeira coleta bem-sucedida",
            });
          }
        }
      } catch (error) {
        if (completed) return;
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Wallet] ❌ Erro fatal em ${wallet.name}: ${msg}`);

        console.log(`[Wallet] 💾 Tentando recuperar do banco após erro...`);

        // 🆕 Tentar cache do GitHub primeiro
        const gitEntry = gitHistoryCache.get(wallet.name);
        const lastValidEntry = getLastValidBalance(wallet.name);
        let fallbackValue = gitEntry?.balance || lastValidEntry?.balance;
        let fallbackTimestamp = gitEntry
          ? new Date(gitEntry.lastUpdated)
          : lastValidEntry
          ? new Date(lastValidEntry.timestamp)
          : undefined;

        if (!fallbackValue) {
          const cached = balanceCache.get(wallet.name);
          fallbackValue = cached?.lastKnownValue;
          fallbackTimestamp = cached?.lastUpdated;
        }

        if (fallbackValue) {
          console.log(
            `[Wallet] ✅ Recuperado do cache após erro: ${fallbackValue}`
          );
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: fallbackValue,
            lastUpdated: fallbackTimestamp || new Date(),
            status: "success",
            lastKnownValue: fallbackValue,
            error: undefined,
          });
        } else {
          console.log(`[Wallet] ❌ Sem cache - primeira coleta necessária`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: "Aguardando",
            lastUpdated: new Date(),
            status: "temporary_error",
            error: "Aguardando primeira coleta bem-sucedida",
          });
        }
      }
    };

    // Execute with timeout
    executeScrap().catch((err) => {
      if (!completed) {
        completed = true;
        if (timeoutHandle) clearTimeout(timeoutHandle);
        console.error(
          `[Wallet] ⚠️ ExecuteScrap error for ${wallet.name}: ${err}`
        );

        console.log(`[Wallet] 💾 Consultando banco após erro no execute...`);

        // 🆕 Tentar cache do GitHub primeiro
        const gitEntry = gitHistoryCache.get(wallet.name);
        const lastValidEntry = getLastValidBalance(wallet.name);
        let fallbackValue = gitEntry?.balance || lastValidEntry?.balance;
        let fallbackTimestamp = gitEntry
          ? new Date(gitEntry.lastUpdated)
          : lastValidEntry
          ? new Date(lastValidEntry.timestamp)
          : undefined;

        if (!fallbackValue) {
          const cached = balanceCache.get(wallet.name);
          fallbackValue = cached?.lastKnownValue;
          fallbackTimestamp = cached?.lastUpdated;
        }

        if (fallbackValue) {
          console.log(`[Wallet] ✅ Usando cache: ${fallbackValue}`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: fallbackValue,
            lastUpdated: fallbackTimestamp || new Date(),
            status: "success",
            lastKnownValue: fallbackValue,
            error: undefined,
          });
        } else {
          console.log(`[Wallet] ❌ Sem histórico - aguardando primeira coleta`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: "Aguardando",
            lastUpdated: new Date(),
            status: "temporary_error",
            error: "Execution failed - will retry next cycle",
          });
        }
      }
    });

    timeoutHandle = setTimeout(() => {
      if (!completed) {
        completed = true;
        console.log(`[Wallet] ⏱️ Timeout atingido para ${wallet.name}`);
        console.log(`[Wallet] 💾 Consultando banco após timeout...`);

        // 🆕 Tentar cache do GitHub primeiro
        const gitEntry = gitHistoryCache.get(wallet.name);
        const lastValidEntry = getLastValidBalance(wallet.name);
        let fallbackValue = gitEntry?.balance || lastValidEntry?.balance;
        let fallbackTimestamp = gitEntry
          ? new Date(gitEntry.lastUpdated)
          : lastValidEntry
          ? new Date(lastValidEntry.timestamp)
          : undefined;

        if (!fallbackValue) {
          const cached = balanceCache.get(wallet.name);
          fallbackValue = cached?.lastKnownValue;
          fallbackTimestamp = cached?.lastUpdated;
        }

        if (fallbackValue) {
          console.log(`[Wallet] ✅ Timeout - usando cache: ${fallbackValue}`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: fallbackValue,
            lastUpdated: fallbackTimestamp || new Date(),
            status: "success",
            lastKnownValue: fallbackValue,
            error: undefined,
          });
        } else {
          console.log(`[Wallet] ❌ Timeout - sem histórico disponível`);
          resolve({
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: "Aguardando",
            lastUpdated: new Date(),
            status: "temporary_error",
            error: "Aguardando primeira coleta bem-sucedida",
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

async function updatePortfolioEvolutionTotal(
  userId: string = "default-user"
): Promise<void> {
  try {
    // Calculate total value from all wallets in cache
    let totalValue = 0;
    const walletNames = new Set(WALLETS.map((w) => w.name));

    for (const [walletName, balance] of Array.from(balanceCache.entries())) {
      if (
        walletNames.has(walletName) &&
        balance.status === "success" &&
        balance.balance
      ) {
        const numValue = parseCurrencyValue(balance.balance);
        if (numValue > 0) {
          totalValue += numValue;
        }
      }
    }

    if (totalValue === 0) {
      console.log(
        `[Portfolio Total] No valid wallet values found, skipping portfolio evolution update`
      );
      return;
    }

    console.log(
      `[Portfolio Total] Updating portfolio evolution with total value: R$ ${totalValue.toFixed(
        2
      )}`
    );

    // Get current date info
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();

    // Update portfolio history for future years (2025-2030) with total portfolio value
    // IMPORTANTE: Só atualiza meses NÃO bloqueados
    for (let year = 2025; year <= 2030; year++) {
      try {
        // Verifica se o mês está bloqueado antes de atualizar
        const existingSnapshot = await storage.getMonthlyPortfolioSnapshot(
          userId,
          currentMonth,
          year
        );

        if (existingSnapshot && existingSnapshot.isLocked === 1) {
          console.log(
            `[Portfolio Total] ⊗ Skipping ${year}-${currentMonth
              .toString()
              .padStart(2, "0")} (locked)`
          );
          continue; // Pula meses bloqueados
        }

        const portfolioEntry = {
          userId,
          totalValue,
          month: currentMonth,
          year,
          date: new Date(year, currentMonth - 1, 1).toISOString().split("T")[0],
        };

        await storage.createOrUpdatePortfolioHistory(portfolioEntry);
        console.log(
          `[Portfolio Total] ✓ Updated portfolio projection for ${year}-${currentMonth
            .toString()
            .padStart(2, "0")}: R$ ${totalValue.toFixed(2)}`
        );
      } catch (error) {
        console.error(
          `[Portfolio Total] ✗ Error updating portfolio for year ${year}:`,
          error
        );
      }
    }

    console.log(`[Portfolio Total] ✓ Portfolio evolution update completed`);
  } catch (error) {
    console.error(
      `[Portfolio Total] ✗ Error updating portfolio evolution:`,
      error
    );
  }
}

async function updateWalletsSequentially(
  wallets: WalletConfig[]
): Promise<void> {
  let browser: Browser | null = null;

  try {
    try {
      browser = await puppeteerExtra.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        timeout: 30000,
      });

      // Rastrear browser globalmente para permitir cancelamento
      currentBrowser = browser;
      console.log("[Sequential] Browser lançado e rastreado");
    } catch (browserLaunchError) {
      console.error("[Sequential] Browser launch failed:", browserLaunchError);
      console.log(
        "[Sequential] Browser not available - will use fallback values for all wallets"
      );
      browser = null;
      currentBrowser = null;
    }

    console.log(
      `[Sequential] Processing ${wallets.length} wallets sequentially`
    );

    // Contador de falhas consecutivas para abortar ciclo em massa
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3; // Abortar se 3 wallets falharem consecutivamente
    let totalFailures = 0;
    let successCount = 0;

    for (let i = 0; i < wallets.length; i++) {
      const wallet = wallets[i];
      console.log(
        `[Sequential] Wallet ${i + 1}/${wallets.length}: ${wallet.name}`
      );

      // Verificar se sistema está sendo resetado
      if (!isRefreshing && currentBrowser === null && browser !== null) {
        console.log(
          "[Sequential] ⚠️ Sistema resetado externamente - abortando ciclo"
        );
        break;
      }

      // Rastrear scraper ativo
      activeScrapers.add(wallet.name);

      // 🕒 Verificar se passou tempo mínimo desde última atualização desta wallet
      const lastUpdate = lastWalletUpdate.get(wallet.name) || 0;
      const timeSinceLastUpdate = Date.now() - lastUpdate;

      if (timeSinceLastUpdate < MIN_WALLET_UPDATE_INTERVAL) {
        const remainingTime = Math.ceil(
          (MIN_WALLET_UPDATE_INTERVAL - timeSinceLastUpdate) / 1000
        );
        console.log(
          `[Sequential] ⏸️ Skipping ${wallet.name} - updated ${Math.ceil(
            timeSinceLastUpdate / 1000
          )}s ago (min interval: 60s, remaining: ${remainingTime}s)`
        );

        // Usar valor do cache
        const cached = balanceCache.get(wallet.name);
        if (cached) {
          console.log(
            `[Sequential] Using cached value for ${wallet.name}: ${cached.balance}`
          );
        }

        activeScrapers.delete(wallet.name);
        continue; // Pular para próxima wallet
      }

      // Se já temos muitas falhas consecutivas, abortar o ciclo e resetar estado
      if (consecutiveFailures >= maxConsecutiveFailures) {
        console.log(
          `[Sequential] ⚠️ Abortando ciclo: ${consecutiveFailures} falhas consecutivas detectadas`
        );
        console.log(
          `[Sequential] ⚠️ Isso indica problemas internos, não problemas dos sites externos`
        );
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
        console.log(
          `[Sequential] Attempt ${attempts}/${maxAttempts} for ${wallet.name}`
        );

        try {
          // Timeouts aumentados para DeBank (90s) e outros (45s)
          const balance = await scrapeWalletWithTimeout(
            browser,
            wallet,
            wallet.link.includes("debank.com") ? 90000 : 45000
          ).catch((err) => {
            console.error(`[Sequential] Scrape error caught: ${err}`);
            // Retorna valor padrão em caso de erro
            return {
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: "Indisponível",
              lastUpdated: new Date(),
              status: "unavailable" as const,
              error: "Scrape failed",
            };
          });

          // Validate the scraped value - must not be 0, null, undefined, or empty
          if (balance.status === "success" && balance.balance) {
            const usdValue = parseCurrencyValue(balance.balance);

            if (usdValue > 0) {
              console.log(
                `[Sequential] Valid value found: ${balance.balance} (parsed as ${usdValue} USD)`
              );

              // Convert USD to BRL using REAL exchange rate (never assume 1:1 parity)
              // Always fetch current USD/BRL rate from exchange rate service
              let brlValue = usdValue;
              let isUSD = false;

              // Detect USD values: either contains '$' or has thousand separator (indicating US format)
              if (
                balance.balance.includes("$") ||
                balance.balance.includes(",")
              ) {
                isUSD = true;
              }

              if (isUSD) {
                // Value is in USD - convert to BRL
                const exchangeRate = await getExchangeRate("USD");

                // Validate exchange rate is reasonable (between 3.0 and 7.0 BRL per USD)
                if (exchangeRate < 3.0 || exchangeRate > 7.0) {
                  console.error(
                    `[Sequential] Invalid exchange rate: ${exchangeRate} - using fallback 5.5`
                  );
                  brlValue = usdValue * 5.5;
                } else {
                  brlValue = usdValue * exchangeRate;
                }

                console.log(
                  `[Sequential] Converted ${usdValue} USD × ${exchangeRate.toFixed(
                    4
                  )} = ${brlValue.toFixed(2)} BRL`
                );
              } else {
                // Value appears to already be in BRL
                brlValue = usdValue;
                console.log(
                  `[Sequential] Value ${usdValue} assumed to be already in BRL`
                );
              }

              // Update balance with numeric BRL value (no formatting)
              balance.balance = brlValue.toString();

              // CRITICAL FIX: Persist converted BRL value to cache file
              // Without this, syncWalletsToAssets reads unconverted USD values
              addCacheEntry(wallet.name, balance.balance, "debank", "success");

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
              console.log(
                `[Sequential] Invalid value (0 or negative): ${balance.balance} - will retry`
              );
            }
          } else {
            console.log(
              `[Sequential] Scrape failed or returned invalid status: ${balance.status}`
            );
          }
        } catch (error) {
          console.error(`[Sequential] Error processing ${wallet.name}:`, error);

          // If we have cached value, use it as fallback
          const cached = balanceCache.get(wallet.name);
          if (cached?.lastKnownValue && attempts === maxAttempts) {
            console.log(
              `[Sequential] Using cached value as fallback: ${cached.lastKnownValue}`
            );
            finalBalance = {
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: cached.lastKnownValue,
              lastUpdated: cached.lastUpdated,
              status: "temporary_error",
              lastKnownValue: cached.lastKnownValue,
              error: "Using cached value",
            };
            balanceCache.set(wallet.name, finalBalance);
            validValue = true;
          }

          // If error and we have more attempts, wait 10 seconds
          if (!validValue && attempts < maxAttempts) {
            console.log(
              `[Sequential] Waiting 10 seconds before retry after error...`
            );
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
        }
      }

      // If still no valid value after all attempts, use fallback with historical data
      if (!validValue) {
        consecutiveFailures++; // Incrementar contador de falhas
        totalFailures++; // Incrementar contador total de falhas
        console.log(
          `[Sequential] Failed to get valid value for ${wallet.name} after ${maxAttempts} attempts (consecutive: ${consecutiveFailures}, total: ${totalFailures})`
        );

        const lastValidEntry = getLastValidBalance(wallet.name);
        let historicalValue = lastValidEntry?.balance;

        if (!historicalValue) {
          const cached = balanceCache.get(wallet.name);
          historicalValue = cached?.lastKnownValue;
        }

        if (historicalValue) {
          console.log(
            `[Sequential] Using historical fallback value: ${historicalValue}`
          );
          const cachedBalance = balanceCache.get(wallet.name);
          finalBalance = {
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: historicalValue,
            lastUpdated: cachedBalance?.lastUpdated || new Date(),
            status: "temporary_error",
            lastKnownValue: historicalValue,
            error: "Usando valor histórico",
          };
        } else {
          // NÃO marcar como "Indisponível" - usar "Aguardando" para indicar que vai tentar novamente
          console.log(
            `[Sequential] No historical value - marking as awaiting retry`
          );
          finalBalance = {
            id: wallet.id,
            name: wallet.name,
            link: wallet.link,
            balance: "Aguardando",
            lastUpdated: new Date(),
            status: "temporary_error",
            error: "Aguardando próxima tentativa",
          };
        }
        balanceCache.set(wallet.name, finalBalance);
      }

      console.log(
        `[Sequential] Final result for ${wallet.name}: ${finalBalance?.balance} (${finalBalance?.status})`
      );

      // Remover scraper do set de ativos
      activeScrapers.delete(wallet.name);

      // 🕒 20 segundos entre wallets diferentes (para respeitar rate limits e permitir carregamento completo)
      if (i < wallets.length - 1) {
        console.log(`[Sequential] Waiting 20 seconds before next wallet...`);
        await new Promise((resolve) => setTimeout(resolve, INTER_WALLET_DELAY));
      }
    }

    // Logging de estatísticas finais
    console.log(
      `[Sequential] ✓ Ciclo finalizado: ${successCount} sucessos, ${totalFailures} falhas`
    );

    // Se teve muitas falhas totais (>50%), considerar reset
    if (wallets.length > 0 && totalFailures / wallets.length > 0.5) {
      console.log(
        `[Sequential] ⚠️ Alta taxa de falhas detectada (${Math.round(
          (totalFailures / wallets.length) * 100
        )}%)`
      );
      console.log(
        `[Sequential] Sistema pode estar em estado degradado - considerar reset manual se persistir`
      );
    }

    // Update portfolio evolution with total value after all wallets are processed
    await updatePortfolioEvolutionTotal();

    // Sync consolidated portfolio evolution from all sources
    try {
      const { syncPortfolioEvolution } = await import("./portfolioSync");
      await syncPortfolioEvolution("default-user");
    } catch (error) {
      console.error("[Sequential] Error syncing portfolio evolution:", error);
    }
  } catch (error) {
    console.error(`[Sequential] Error:`, error);
    // Em caso de erro crítico, resetar estado
    console.log("[Sequential] Erro crítico - iniciando reset de segurança");
    await resetWalletTrackerState();
  } finally {
    // Limpar scrapers ativos
    activeScrapers.clear();

    // Garantir fechamento do browser em qualquer situação
    if (browser) {
      try {
        await browser.close().catch((err) => {
          console.log(
            "[Sequential] Browser close warning:",
            err?.message || "unknown"
          );
        });
        console.log("[Sequential] Browser closed successfully");
      } catch (e) {
        console.log("[Sequential] Browser was already closed or unavailable");
      }
    }

    // Limpar referência global
    currentBrowser = null;
    console.log("[Sequential] ✓ Referência global de browser limpa");
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function getBalances(): string[] {
  const walletNames = new Set(WALLETS.map((w) => w.name));
  return Array.from(balanceCache.values())
    .filter((balance) => walletNames.has(balance.name))
    .map((w) => w.balance);
}

export async function getDetailedBalances(): Promise<WalletBalance[]> {
  const walletNames = new Set(WALLETS.map((w) => w.name));

  // Fixed initial values for specific wallets (seed data for display)
  // These values are used when NO history exists and wallet is in the list
  const INITIAL_WALLET_VALUES: Record<string, string> = {
    "EVM-madnessmain": "296054.16",
    "EVM-madnesstrezor": "57810.96",
    "EVM-madnesstwo": "88.32",
    "STARKNET-madness": "894.68",
    "APTOS-madness": "83.08",
    "SEI-madness": "196.18",
  };

  // Helper: Converter valor USD para BRL se necessário
  const ensureBRL = async (balance: string): Promise<string> => {
    // Se já está em BRL ou é placeholder, retornar como está
    if (!balance || balance === "Loading..." || balance === "Carregando..." || 
        balance === "Aguardando" || balance === "Indisponível" || balance === "Erro") {
      return balance;
    }

    // Se contém "$" ou vírgula no formato americano, está em USD
    if (balance.includes("$") || /^\d{1,3}(,\d{3})+(\.\d{2})?$/.test(balance)) {
      try {
        // Parse USD value
        const usdValue = parseFloat(balance.replace(/[\$,]/g, ""));
        
        if (!isNaN(usdValue) && usdValue > 0) {
          // Get exchange rate and convert
          const exchangeRate = await getExchangeRate("USD");
          const brlValue = usdValue * exchangeRate;
          
          console.log(`[DetailedBalances] Converted ${balance} USD → ${brlValue.toFixed(2)} BRL (rate: ${exchangeRate})`);
          return brlValue.toFixed(2);
        }
      } catch (error) {
        console.error(`[DetailedBalances] Error converting ${balance} to BRL:`, error);
      }
    }

    // Já está em BRL ou formato inválido, retornar como está
    return balance;
  };

  // 🎯 REGRA PRINCIPAL: Backend é fonte única de verdade
  // Se scraping falhou, SEMPRE usar último saldo válido do histórico
  const balances = Array.from(balanceCache.values())
    .filter((balance) => walletNames.has(balance.name))
    .map(async (wallet) => {
      // Se o status NÃO é success, buscar último saldo válido do histórico
      if (wallet.status !== "success") {
        // 1. Buscar último registro válido do histórico (arquivo wallet-cache.json)
        const lastValidEntry = await getLastValidBalance(wallet.name);

        if (lastValidEntry) {
          const balanceBRL = await ensureBRL(lastValidEntry.balance);
          console.log(
            `[getDetailedBalances] ${wallet.name}: usando último saldo válido do histórico: ${balanceBRL} (${lastValidEntry.timestamp})`
          );

          // ✅ CORREÇÃO: Se há histórico salvo, status DEVE ser 'success' e erro DEVE ser null
          // Falha de browser não é erro funcional quando há dados persistidos
          return {
            ...wallet,
            balance: balanceBRL,
            lastUpdated: new Date(lastValidEntry.timestamp),
            status: "success" as const, // ✅ Status OK quando usa histórico
            lastKnownValue: balanceBRL,
            error: undefined, // ✅ Sem erro quando há histórico válido
          };
        }

        // 2. Se não tem histórico, usar lastKnownValue do cache em memória
        if (wallet.lastKnownValue) {
          const balanceBRL = await ensureBRL(wallet.lastKnownValue);
          console.log(
            `[getDetailedBalances] ${wallet.name}: usando lastKnownValue do cache: ${balanceBRL}`
          );
          return {
            ...wallet,
            balance: balanceBRL,
            status: "success" as const, // ✅ Status OK quando usa cache válido
            lastKnownValue: balanceBRL,
            error: undefined, // ✅ Sem erro quando há valor conhecido
          };
        }

        // 3. ⚠️ INTERCEPTAR "Aguardando" - aplicar valor inicial se wallet está na lista
        const seedValue = INITIAL_WALLET_VALUES[wallet.name];
        if (seedValue) {
          const seedBRL = await ensureBRL(seedValue);
          console.log(
            `[getDetailedBalances] ${wallet.name}: aplicando valor inicial seed: R$ ${seedBRL}`
          );

          // Criar histórico inicial para persistir o valor
          createInitialHistoryEntry(wallet.name, seedBRL, "seed-api");

          // Atualizar cache em memória
          balanceCache.set(wallet.name, {
            ...wallet,
            balance: seedBRL,
            lastUpdated: new Date(),
            status: "success",
            lastKnownValue: seedBRL,
            error: undefined,
          });

          return {
            ...wallet,
            balance: seedBRL,
            lastUpdated: new Date(),
            status: "success" as const,
            lastKnownValue: seedBRL,
            error: undefined,
          };
        }

        // 4. ⚠️ APENAS AQUI pode retornar "Aguardando" - quando NUNCA houve saldo salvo e NÃO está na lista seed
        console.log(
          `[getDetailedBalances] ${wallet.name}: sem histórico disponível - aguardando primeira coleta`
        );
        return {
          ...wallet,
          balance: "Aguardando",
          status: "temporary_error" as const,
          error: "Aguardando primeira coleta bem-sucedida",
        };
      }

      // Status é success - garantir conversão BRL antes de retornar
      const balanceBRL = await ensureBRL(wallet.balance);
      return {
        ...wallet,
        balance: balanceBRL,
        lastKnownValue: wallet.lastKnownValue ? await ensureBRL(wallet.lastKnownValue) : undefined,
      };
    });

  return await Promise.all(balances);
}

export async function initializeWallet(wallet: WalletConfig): Promise<void> {
  if (!balanceCache.has(wallet.name)) {
    // Fixed initial values for specific wallets (seed data)
    // These values are used ONLY if no history exists for the wallet
    const INITIAL_WALLET_VALUES: Record<string, string> = {
      // EVM wallets
      "https://debank.com/profile/0x083c828b221b126965a146658d4e512337182df1":
        "296054.16",
      "https://debank.com/profile/0xb5a4bccc07c1f25f43c0215627853e39b6bd3ac7":
        "57810.96",
      "https://debank.com/profile/0x0b2812ecda6ed953ff85db3c594efe42dfbdb84a":
        "88.32",
      // STARKNET wallet
      "https://portfolio.ready.co/overview/0x00debe613076fc8e271e717c5828c7aec498a64dd589e8b97746e2d659458d68":
        "894.68",
      // APTOS wallet
      "https://aptoscan.com/account/0xfddb8e3f927ce776bc82145b2df5c9f7d2f7d1fcd66e032a6b1e853231f7d9a6":
        "83.08",
      // SEI wallet
      "https://seiscan.io/address/0x712e1b166769b12b95eea57571e3d6fe14f73d9d":
        "196.18",
    };

    // Try to get initial value from existing asset or predefined seed values
    let initialValue: string | null = null;
    let source: string = "unknown";

    // Check if this wallet has a predefined seed value
    const seedValue = INITIAL_WALLET_VALUES[wallet.link];
    if (seedValue) {
      // Verify no history exists before using seed value
      const existingHistory = getLastValidBalance(wallet.name);
      if (!existingHistory) {
        initialValue = seedValue;
        source = "seed";
        console.log(
          `[Init] Using predefined seed value for ${wallet.name}: R$ ${initialValue}`
        );
      } else {
        console.log(
          `[Init] Wallet ${wallet.name} already has history, skipping seed value`
        );
      }
    }

    // If no seed value, try to get from existing asset
    if (!initialValue) {
      try {
        const assets = await storage.getAssets();
        const matchingAsset = assets.find(
          (asset) =>
            (asset.market === "crypto" ||
              asset.market === "crypto_simplified") &&
            asset.name.toLowerCase() === wallet.name.toLowerCase()
        );

        if (
          matchingAsset &&
          matchingAsset.currentPrice &&
          matchingAsset.currentPrice > 0
        ) {
          initialValue = matchingAsset.currentPrice.toString();
          source = "asset";
          console.log(
            `[Init] Found existing asset value for ${wallet.name}: R$ ${initialValue}`
          );
        }
      } catch (error) {
        console.log(`[Init] Could not fetch asset for ${wallet.name}:`, error);
      }
    }

    // If we have an initial value, create history entry immediately
    if (initialValue) {
      createInitialHistoryEntry(wallet.name, initialValue, source);

      balanceCache.set(wallet.name, {
        id: wallet.id,
        name: wallet.name,
        link: wallet.link,
        balance: initialValue,
        lastUpdated: new Date(),
        status: "success",
        lastKnownValue: initialValue,
      });
      console.log(
        `[Init] ✓ Initialized wallet ${wallet.name} with ${source} value: R$ ${initialValue}`
      );
    } else {
      // No initial value - wallet will stay in "Aguardando" until first successful scrape
      balanceCache.set(wallet.name, {
        id: wallet.id,
        name: wallet.name,
        link: wallet.link,
        balance: "Aguardando",
        lastUpdated: new Date(),
        status: "temporary_error",
        error: "Aguardando primeira coleta bem-sucedida",
        lastKnownValue: undefined,
      });
      console.log(
        `[Init] Wallet ${wallet.name} initialized - awaiting first scrape`
      );
    }
  }
}

export function startStepMonitor(intervalMs: number): void {
  console.log(
    `[Step.finance] Starting monitor with ${
      intervalMs / 1000 / 60
    } minute interval`
  );

  if (refreshInterval) clearInterval(refreshInterval);

  // 🆕 Inicializar histórico do GitHub
  initializeHistory()
    .then(() => {
      console.log(
        "[WalletTracker] Histórico inicializado, começando atualizações..."
      );

      // Initial run
      updateWalletsSequentially(WALLETS);

      // Schedule periodic updates
      refreshInterval = setInterval(() => {
        console.log("[Step.finance] Scheduled wallet update");
        updateWalletsSequentially(WALLETS);
      }, intervalMs);
    })
    .catch((err) => {
      console.error("[WalletTracker] Erro ao inicializar histórico:", err);

      // Continuar mesmo com erro
      updateWalletsSequentially(WALLETS);

      refreshInterval = setInterval(() => {
        console.log("[Step.finance] Scheduled wallet update");
        updateWalletsSequentially(WALLETS);
      }, intervalMs);
    });
}

export async function forceRefreshAndWait(): Promise<WalletBalance[]> {
  console.log(
    "[Force] 🔄 Atualização manual solicitada - forçando reset completo"
  );

  // STEP 1: Reset completo do estado interno
  await resetWalletTrackerState();

  // STEP 2: Aguardar 2 segundos para garantir que tudo foi limpo
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // STEP 3: Marca todas as wallets como "em atualização" com valores históricos
  for (const wallet of WALLETS) {
    const lastValidEntry = getLastValidBalance(wallet.name);
    let fallbackValue = lastValidEntry?.balance;

    if (!fallbackValue) {
      const cached = balanceCache.get(wallet.name);
      fallbackValue = cached?.lastKnownValue;
    }

    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: fallbackValue || "Atualizando...",
      lastUpdated: new Date(),
      status: fallbackValue ? "temporary_error" : "temporary_error",
      lastKnownValue: fallbackValue,
      error: "Atualização manual em andamento",
    });
  }

  // STEP 4: Aguardar atualização completa com timeout de segurança
  try {
    await Promise.race([
      updateWalletsSequentially(WALLETS),
      new Promise(
        (_, reject) =>
          setTimeout(() => reject(new Error("Update timeout")), 300000) // 5 minutos max
      ),
    ]);
  } catch (error) {
    console.error("[Force] Update timeout ou erro:", error);
    console.log("[Force] Resetando sistema após timeout...");
    await resetWalletTrackerState();
  }

  return await getDetailedBalances();
}

export async function forceRefreshWallet(
  walletName: string
): Promise<WalletBalance | null> {
  console.log(`[Force] Refreshing wallet: ${walletName}`);

  const wallet = WALLETS.find((w) => w.name === walletName);
  if (!wallet) {
    console.log(`[Force] Wallet not found: ${walletName}`);
    return null;
  }

  let browser: Browser | null = null;

  try {
    // Only create browser if needed
    const needsBrowser =
      wallet.link.includes("debank.com") ||
      wallet.link.includes("jup.ag") ||
      wallet.link.includes("portfolio.ready.co");

    if (needsBrowser) {
      browser = await puppeteerExtra.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
      });
    }

    const timeoutMs = wallet.link.includes("debank.com")
      ? 65000
      : wallet.link.includes("jup.ag")
      ? 50000
      : wallet.link.includes("portfolio.ready.co")
      ? 50000
      : 35000;

    const balance = await scrapeWalletWithTimeout(browser, wallet, timeoutMs);
    balanceCache.set(wallet.name, balance);

    // Update corresponding asset if balance was successfully retrieved
    if (balance.status === "success") {
      let brlValue = parseCurrencyValue(balance.balance);

      // Check if value is in USD and needs conversion
      if (balance.balance.includes("$") || balance.balance.includes(",")) {
        const exchangeRate = await getExchangeRate("USD");
        const usdValue = brlValue;
        brlValue =
          usdValue *
          (exchangeRate >= 3.0 && exchangeRate <= 7.0 ? exchangeRate : 5.5);
        console.log(
          `[forceRefreshWallet] Converted ${
            wallet.name
          }: ${usdValue} USD → ${brlValue.toFixed(2)} BRL`
        );

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
      console.log(
        `[Force] Using cached value after error: ${cached.lastKnownValue}`
      );
      return cached;
    }
    return null;
  } finally {
    // Garantir fechamento do browser em qualquer situação
    if (browser) {
      try {
        await browser.close().catch((err) => {
          console.log(
            "[Force] Browser close warning:",
            err?.message || "unknown"
          );
        });
        console.log("[Force] Browser closed successfully");
      } catch (e) {
        console.log("[Force] Browser was already closed or unavailable");
      }
    }
  }
}

export async function forceRefresh(): Promise<WalletBalance[]> {
  console.log("[Force] 🔄 Refresh iniciado");

  // Se já está processando, resetar e tentar novamente
  if (isRefreshing) {
    console.log(
      "[Force] Sistema ocupado - resetando estado e tentando novamente"
    );
    await resetWalletTrackerState();
    // Aguardar 1 segundo antes de tentar novamente
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Marca como em processamento e inicia
  isRefreshing = true;
  updateWalletsSequentially(WALLETS).finally(() => {
    isRefreshing = false;
    setTimeout(() => processRefreshQueue(), 2000);
  });

  return await getDetailedBalances();
}
