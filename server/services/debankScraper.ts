import puppeteer, { Browser } from 'puppeteer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

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
  // Extract Ethereum address from DeBank URL: https://debank.com/profile/0x...
  // Or Solana address from Step.finance URL
  const ethMatch = link.match(/0x[a-fA-F0-9]{40}/);
  if (ethMatch) return ethMatch[0];
  
  const solanaMatch = link.match(/profile\/([A-Z0-9]{40,})/);
  if (solanaMatch) return solanaMatch[1];
  
  return null;
}

async function scrapeWalletBalance(browser: Browser, wallet: WalletConfig): Promise<WalletBalance> {
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log(`[Step.finance] Fetching balance for ${wallet.name} from ${wallet.link}`);
    
    // Try API approach first if it's a DeBank link
    if (wallet.link.includes('debank.com')) {
      const address = await extractAddressFromLink(wallet.link);
      if (address) {
        console.log(`[Step.finance] Extracted address from DeBank URL: ${address}`);
        try {
          const apiUrl = `https://api.debank.com/v1/user/total_balance?id=${address}`;
          console.log(`[Step.finance] Calling DeBank API: ${apiUrl}`);
          
          const response = await fetch(apiUrl, {
            headers: { "Accept": "application/json" }
          });

          console.log(`[Step.finance] API response status: ${response.status}`);

          if (response.ok) {
            const data = await response.json() as any;
            const balanceUSD = data.total_usd_value || 0;
            const formatted = `$${balanceUSD.toFixed(2)}`;
            console.log(`[Step.finance] Found API balance for ${wallet.name}: ${formatted}`);
            return {
              id: wallet.id,
              name: wallet.name,
              link: wallet.link,
              balance: formatted,
              lastUpdated: new Date(),
            };
          } else {
            console.log(`[Step.finance] API returned status ${response.status} for ${wallet.name}`);
          }
        } catch (apiError) {
          console.log(`[Step.finance] API call failed for ${wallet.name}: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`);
        }
      }
    }

    // Fallback to browser scraping (skip if already tried API)
    if (wallet.link.includes('debank.com')) {
      console.log(`[Step.finance] API failed, skipping web scraping for ${wallet.name}`);
      return {
        id: wallet.id,
        name: wallet.name,
        link: wallet.link,
        balance: 'Verifique a wallet',
        lastUpdated: new Date(),
        error: 'API não encontrou dados para este endereço',
      };
    }

    await page.goto(wallet.link, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });

    await page.waitForSelector('[class*="PortfolioValue"], [class*="portfolio"], [class*="total"]', { 
      timeout: 20000 
    }).catch(() => {
      console.log(`[Step.finance] Waiting for dynamic content for ${wallet.name}...`);
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const balance = await page.evaluate(() => {
      const selectors = [
        '[class*="PortfolioValue"]',
        '[class*="totalValue"]',
        '[class*="total-value"]',
        'span[class*="value"]',
      ];

      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        for (const el of elements) {
          const text = (el as HTMLElement).textContent?.trim();
          if (text && /(\$|USD|SOL)[\s\d,.]+/i.test(text)) {
            return text;
          }
        }
      }

      return null;
    });

    if (balance) {
      console.log(`[Step.finance] Found balance for ${wallet.name}: ${balance}`);
    } else {
      console.log(`[Step.finance] No balance found for ${wallet.name}`);
    }

    await page.screenshot({ path: `/tmp/step_${wallet.name}.png`, fullPage: false });
    await page.close();

    return {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: balance || 'Indisponível',
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error(`[Step.finance] Error fetching ${wallet.name}:`, error);
    await page.close().catch(() => {});
    
    return {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: 'Erro ao carregar',
      lastUpdated: new Date(),
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function updateWalletBalance(wallet: WalletConfig): Promise<void> {
  let browser: Browser | null = null;

  try {
    const chromiumPath = await getChromiumPath();
    
    browser = await puppeteer.launch({
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

    const balance = await scrapeWalletBalance(browser, wallet);
    balanceCache.set(wallet.name, balance);
    console.log(`[Step.finance] Updated ${wallet.name}: ${balance.balance}`);
  } catch (error) {
    console.error(`[Step.finance] Error updating ${wallet.name}:`, error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function scheduleWalletUpdates(): Promise<void> {
  WALLETS.forEach((wallet, index) => {
    const delayMs = index * 10 * 1000; // 10 seconds between each wallet
    
    console.log(`[Step.finance] Scheduling ${wallet.name} to update in ${delayMs / 1000} seconds`);
    
    const timeout = setTimeout(async () => {
      await updateWalletBalance(wallet);
    }, delayMs);
    
    walletUpdateTimeouts.set(wallet.name, timeout);
  });
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
      error: cached?.error,
    };
  });
}

export function startStepMonitor(intervalMs: number = 60 * 60 * 1000): void {
  const intervalMinutes = intervalMs / 1000 / 60;
  console.log(`[Step.finance] Starting monitor with ${intervalMinutes} minute interval and 10 second spacing between wallets`);

  for (const wallet of WALLETS) {
    balanceCache.set(wallet.name, {
      id: wallet.id,
      name: wallet.name,
      link: wallet.link,
      balance: 'Loading...',
      lastUpdated: new Date(),
    });
  }

  setTimeout(() => {
    scheduleWalletUpdates();
  }, 5000);

  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(() => {
    walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
    walletUpdateTimeouts.clear();
    
    scheduleWalletUpdates();
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
