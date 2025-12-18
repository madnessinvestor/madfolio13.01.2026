import puppeteer, { Browser } from 'puppeteer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { Wallet } from '@shared/schema';

const execAsync = promisify(exec);

interface WalletConfig {
  id?: string;
  name: string;
  address: string;
}

interface WalletBalance {
  id?: string;
  name: string;
  address: string;
  balance: string;
  lastUpdated: Date;
  error?: string;
}

let WALLETS: WalletConfig[] = [
  { name: "EVM-madnessmain", address: "0x083c828b221b126965a146658d4e512337182df1" },
  { name: "EVM-madnesstrezor", address: "0xb5a4bccc07c1f25f43c0215627853e39b6bd3ac7" },
  { name: "EVM-madnesstwo", address: "0x0b2812ecda6ed953ff85db3c594efe42dfbdb84a" },
];

export function setWallets(newWallets: WalletConfig[]): void {
  WALLETS = newWallets;
}

const balanceCache = new Map<string, WalletBalance>();
let isUpdating = false;
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

async function scrapeWalletBalance(browser: Browser, wallet: WalletConfig): Promise<WalletBalance> {
  const page = await browser.newPage();
  
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const url = `https://debank.com/profile/${wallet.address}`;
    console.log(`[DeBank] Fetching balance for ${wallet.name} from ${url}`);
    
    await page.goto(url, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    await page.waitForSelector('.HeaderInfo_totalAssetInner__HyrdC, .HeaderInfo_total__2ldjf, [class*="HeaderInfo_total"]', { 
      timeout: 30000 
    }).catch(() => {
      console.log(`[DeBank] Waiting for dynamic content for ${wallet.name}...`);
    });

    await new Promise(resolve => setTimeout(resolve, 5000));

    const balance = await page.evaluate(() => {
      const selectors = [
        '.HeaderInfo_totalAssetInner__HyrdC',
        '.HeaderInfo_total__2ldjf',
        '[class*="HeaderInfo_total"]',
        '[class*="totalAsset"]',
        '[class*="net-worth"]',
        '.HeaderInfo_usdValue__sGVHp'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent?.trim();
          if (text && text.includes('$')) {
            const match = text.match(/^\$[\d,]+(\.\d+)?/);
            return match ? match[0] : text;
          }
        }
      }

      const allElements = Array.from(document.querySelectorAll('*'));
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const text = el.textContent?.trim();
        if (text) {
          const match = text.match(/^\$[\d,]+(\.\d+)?/);
          if (match && parseFloat(match[0].replace(/[$,]/g, '')) > 100) {
            return match[0];
          }
        }
      }
      
      return null;
    });

    if (!balance) {
      console.log(`[DeBank] Could not find balance for ${wallet.name}, taking screenshot for debugging`);
      await page.screenshot({ path: `/tmp/debank_${wallet.name}.png`, fullPage: false });
    }

    await page.close();

    return {
      name: wallet.name,
      address: wallet.address,
      balance: balance || 'N/A',
      lastUpdated: new Date(),
    };
  } catch (error) {
    console.error(`[DeBank] Error fetching ${wallet.name}:`, error);
    await page.close().catch(() => {});
    
    return {
      name: wallet.name,
      address: wallet.address,
      balance: 'Error',
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
    console.log(`[DeBank] Updated ${wallet.name}: ${balance.balance}`);
  } catch (error) {
    console.error(`[DeBank] Error updating ${wallet.name}:`, error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

async function scheduleWalletUpdates(): Promise<void> {
  // Schedule each wallet with 10 second intervals
  WALLETS.forEach((wallet, index) => {
    const delayMs = index * 10 * 1000; // 10 seconds between each wallet
    
    console.log(`[DeBank] Scheduling ${wallet.name} to update in ${delayMs / 1000} seconds`);
    
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
      address: wallet.address,
      balance: cached?.balance || 'Loading...',
      lastUpdated: cached?.lastUpdated || new Date(),
      error: cached?.error,
    };
  });
}

export function startDeBankMonitor(intervalMs: number = 60 * 60 * 1000): void {
  const intervalMinutes = intervalMs / 1000 / 60;
  console.log(`[DeBank] Starting monitor with ${intervalMinutes} minute interval and 10 second spacing between wallets`);

  for (const wallet of WALLETS) {
    balanceCache.set(wallet.name, {
      name: wallet.name,
      address: wallet.address,
      balance: 'Loading...',
      lastUpdated: new Date(),
    });
  }

  // Initial schedule after 5 seconds
  setTimeout(() => {
    scheduleWalletUpdates();
  }, 5000);

  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  // Schedule recurring updates every intervalMs (1 hour by default)
  refreshInterval = setInterval(() => {
    // Clear any existing timeouts
    walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
    walletUpdateTimeouts.clear();
    
    // Schedule new batch of updates
    scheduleWalletUpdates();
  }, intervalMs);
}

export function stopDeBankMonitor(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
  
  walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
  walletUpdateTimeouts.clear();
  
  console.log('[DeBank] Monitor stopped');
}

export async function forceRefresh(): Promise<void> {
  // Clear any existing timeouts
  walletUpdateTimeouts.forEach(timeout => clearTimeout(timeout));
  walletUpdateTimeouts.clear();
  
  // Schedule immediate staggered updates
  await scheduleWalletUpdates();
}
