import puppeteer, { Browser } from 'puppeteer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

interface WalletConfig {
  name: string;
  address: string;
}

interface WalletBalance {
  name: string;
  address: string;
  balance: string;
  lastUpdated: Date;
  error?: string;
}

const WALLETS: WalletConfig[] = [
  { name: "EVM-madnessmain", address: "0x083c828b221b126965a146658d4e512337182df1" },
  { name: "EVM-madnesstrezor", address: "0xb5a4bccc07c1f25f43c0215627853e39b6bd3ac7" },
  { name: "EVM-madnesstwo", address: "0x0b2812ecda6ed953ff85db3c594efe42dfbdb84a" },
];

const balanceCache = new Map<string, WalletBalance>();
let isUpdating = false;
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
            return text;
          }
        }
      }

      const allElements = Array.from(document.querySelectorAll('*'));
      for (let i = 0; i < allElements.length; i++) {
        const el = allElements[i];
        const text = el.textContent?.trim();
        if (text && /^\$[\d,]+(\.\d+)?$/.test(text) && parseFloat(text.replace(/[$,]/g, '')) > 100) {
          return text;
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

async function updateAllBalances(): Promise<void> {
  if (isUpdating) {
    console.log('[DeBank] Update already in progress, skipping...');
    return;
  }

  isUpdating = true;
  let browser: Browser | null = null;

  try {
    console.log('[DeBank] Starting balance update for all wallets...');
    
    const chromiumPath = await getChromiumPath();
    console.log('[DeBank] Using Chromium at:', chromiumPath);

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

    for (const wallet of WALLETS) {
      const balance = await scrapeWalletBalance(browser, wallet);
      balanceCache.set(wallet.name, balance);
      console.log(`[DeBank] Updated ${wallet.name}: ${balance.balance}`);
      
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    console.log('[DeBank] All balances updated successfully');
  } catch (error) {
    console.error('[DeBank] Error during balance update:', error);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    isUpdating = false;
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
    return cached || {
      name: wallet.name,
      address: wallet.address,
      balance: 'Loading...',
      lastUpdated: new Date(),
    };
  });
}

export function startDeBankMonitor(intervalMs: number = 15 * 60 * 1000): void {
  console.log(`[DeBank] Starting monitor with ${intervalMs / 1000 / 60} minute interval`);

  for (const wallet of WALLETS) {
    balanceCache.set(wallet.name, {
      name: wallet.name,
      address: wallet.address,
      balance: 'Loading...',
      lastUpdated: new Date(),
    });
  }

  setTimeout(() => {
    updateAllBalances();
  }, 5000);

  if (refreshInterval) {
    clearInterval(refreshInterval);
  }

  refreshInterval = setInterval(() => {
    updateAllBalances();
  }, intervalMs);
}

export function stopDeBankMonitor(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('[DeBank] Monitor stopped');
  }
}

export async function forceRefresh(): Promise<void> {
  await updateAllBalances();
}
