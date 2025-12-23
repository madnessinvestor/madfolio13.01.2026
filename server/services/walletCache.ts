import * as fs from 'fs';
import * as path from 'path';

interface CacheEntry {
  walletName: string;
  balance: string;
  platform: string;
  timestamp: string;
  status: 'success' | 'temporary_error' | 'unavailable';
}

interface CacheHistory {
  lastUpdated: string;
  entries: CacheEntry[];
}

const cacheFilePath = path.join(process.cwd(), 'wallet-cache.json');

// Initialize cache file if it doesn't exist
function initializeCacheFile(): void {
  if (!fs.existsSync(cacheFilePath)) {
    const initialCache: CacheHistory = {
      lastUpdated: new Date().toISOString(),
      entries: []
    };
    fs.writeFileSync(cacheFilePath, JSON.stringify(initialCache, null, 2));
    console.log('[Cache] Initialized wallet cache file');
  }
}

// Read cache from file
export function readCache(): CacheHistory {
  try {
    if (!fs.existsSync(cacheFilePath)) {
      initializeCacheFile();
    }
    const data = fs.readFileSync(cacheFilePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Cache] Error reading cache:', error);
    return { lastUpdated: new Date().toISOString(), entries: [] };
  }
}

// Write cache to file
function writeCache(cache: CacheHistory): void {
  try {
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error('[Cache] Error writing cache:', error);
  }
}

// Add entry to cache history
export function addCacheEntry(
  walletName: string,
  balance: string,
  platform: string,
  status: 'success' | 'temporary_error' | 'unavailable'
): void {
  const cache = readCache();
  
  const entry: CacheEntry = {
    walletName,
    balance,
    platform,
    timestamp: new Date().toISOString(),
    status
  };

  cache.entries.push(entry);
  cache.lastUpdated = new Date().toISOString();

  // Keep only last 20 entries per wallet (persistência das últimas 20 atualizações)
  const walletEntries = cache.entries
    .map((e, idx) => ({ entry: e, originalIndex: idx }))
    .filter(item => item.entry.walletName === walletName);
  
  if (walletEntries.length > 20) {
    // Remove as entradas mais antigas desta wallet (mantém apenas as últimas 20)
    const entriesToRemove = walletEntries.slice(0, walletEntries.length - 20);
    const indicesToRemove = new Set(entriesToRemove.map(item => item.originalIndex));
    cache.entries = cache.entries.filter((_, idx) => !indicesToRemove.has(idx));
  }

  writeCache(cache);
  console.log(`[Cache] Added entry for ${walletName}: ${balance} (keeping last 20)`);
}

// Get wallet history
export function getWalletHistory(walletName: string, limit: number = 100): CacheEntry[] {
  const cache = readCache();
  return cache.entries
    .filter(e => e.walletName === walletName)
    .slice(-limit)
    .reverse();
}

// Get all history
export function getAllHistory(): CacheEntry[] {
  const cache = readCache();
  return cache.entries.slice(-500).reverse();
}

// Get latest for each wallet
export function getLatestByWallet(): Record<string, CacheEntry> {
  const cache = readCache();
  const latest: Record<string, CacheEntry> = {};

  for (const entry of cache.entries.reverse()) {
    if (!latest[entry.walletName]) {
      latest[entry.walletName] = entry;
    }
  }

  return latest;
}

// Get the last highest valid value from history
export function getLastHighestValue(walletName: string): string | null {
  const cache = readCache();
  const entries = cache.entries
    .filter(e => e.walletName === walletName && e.status === 'success')
    .reverse(); // Most recent first

  if (entries.length === 0) {
    return null;
  }

  // Extract numeric values from successful entries
  const valuesWithEntry = entries
    .map(e => {
      const num = parseFloat(e.balance.replace(/[$,]/g, ''));
      return { value: isNaN(num) ? null : num, balance: e.balance };
    })
    .filter(v => v.value !== null && v.value > 0);

  if (valuesWithEntry.length === 0) {
    return null;
  }

  // Find the highest value
  const highest = valuesWithEntry.reduce((max, current) => 
    (current.value! > max.value!) ? current : max
  );

  return highest.balance;
}

// Get wallet statistics
export function getWalletStats(walletName: string) {
  const cache = readCache();
  const entries = cache.entries.filter(e => e.walletName === walletName);

  if (entries.length === 0) {
    return null;
  }

  // Extract numeric values
  const values = entries
    .map(e => {
      const num = parseFloat(e.balance.replace(/[$,]/g, ''));
      return isNaN(num) ? null : num;
    })
    .filter((v): v is number => v !== null);

  if (values.length === 0) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const current = values[values.length - 1];
  const change = current - values[0];
  const changePercent = (change / values[0]) * 100;

  return {
    walletName,
    currentBalance: current,
    minBalance: min,
    maxBalance: max,
    avgBalance: avg,
    change,
    changePercent,
    totalEntries: entries.length,
    firstEntry: entries[0].timestamp,
    lastEntry: entries[entries.length - 1].timestamp
  };
}

// Initialize on module load
initializeCacheFile();
