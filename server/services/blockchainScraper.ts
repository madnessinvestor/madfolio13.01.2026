import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { addCacheEntry } from "./walletCache";

puppeteer.use(StealthPlugin());

interface BlockchainWalletConfig {
  name: string;
  link: string;
  blockchain: "starknet" | "aptos" | "sei";
}

interface BlockchainBalance {
  name: string;
  link: string;
  balance: string;
  lastUpdated: Date;
  status: "success" | "temporary_error" | "unavailable";
  error?: string;
}

/**
 * Extrai o valor de Portfolio.ready.co (STARKNET)
 * Busca o MAIOR valor ($) encontrado na página
 */
async function extractStarknetBalance(page: any, walletName: string): Promise<string | null> {
  console.log(`[STARKNET] Extracting balance for ${walletName}`);
  try {
    await page.waitForSelector("body", { timeout: 10000 });
    
    // Aguardar até 30 segundos para o JS carregar completamente
    await page.waitForTimeout(30000);
    
    const balance = await page.evaluate(() => {
      const pageText = document.body.innerText;
      
      // Busca todos os valores em formato $X,XXX.XX
      const regex = /\$[\d,]+(?:\.\d{2})?/g;
      const matches = pageText.match(regex);
      
      if (matches && matches.length > 0) {
        // Converte para número para comparar
        const values = matches.map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,]/g, ''))
        }));
        
        // Retorna o maior valor
        const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
        return maxValue.str;
      }
      
      return null;
    });
    
    if (balance) {
      addCacheEntry(walletName, balance, "starknet", "success");
      return balance;
    }
    
    console.log(`[STARKNET] No balance found for ${walletName}`);
    return null;
  } catch (error) {
    console.error(`[STARKNET] Error extracting balance for ${walletName}:`, error);
    return null;
  }
}

/**
 * Extrai o valor de Aptoscan.com (APTOS)
 * Busca o MAIOR valor ($) encontrado na página
 */
async function extractAptosBalance(page: any, walletName: string): Promise<string | null> {
  console.log(`[APTOS] Extracting balance for ${walletName}`);
  try {
    await page.waitForSelector("body", { timeout: 10000 });
    
    // Aguardar até 30 segundos para o JS carregar completamente
    await page.waitForTimeout(30000);
    
    const balance = await page.evaluate(() => {
      const pageText = document.body.innerText;
      
      // Busca todos os valores em formato $X,XXX.XX ou XYZ APT
      const regex = /\$[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d+)?\s*APT/gi;
      const matches = pageText.match(regex);
      
      if (matches && matches.length > 0) {
        // Converte para número para comparar
        const values = matches.map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,\sAPT]/gi, ''))
        }));
        
        // Retorna o maior valor
        const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
        return maxValue.str;
      }
      
      return null;
    });
    
    if (balance) {
      addCacheEntry(walletName, balance, "aptos", "success");
      return balance;
    }
    
    console.log(`[APTOS] No balance found for ${walletName}`);
    return null;
  } catch (error) {
    console.error(`[APTOS] Error extracting balance for ${walletName}:`, error);
    return null;
  }
}

/**
 * Extrai o valor de Seiscan.io (SEI)
 * Busca o MAIOR valor ($) encontrado na página
 */
async function extractSeiBalance(page: any, walletName: string): Promise<string | null> {
  console.log(`[SEI] Extracting balance for ${walletName}`);
  try {
    await page.waitForSelector("body", { timeout: 10000 });
    
    // Aguardar até 30 segundos para o JS carregar completamente
    await page.waitForTimeout(30000);
    
    const balance = await page.evaluate(() => {
      const pageText = document.body.innerText;
      
      // Busca todos os valores em formato $X,XXX.XX ou XYZ SEI
      const regex = /\$[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d+)?\s*SEI/gi;
      const matches = pageText.match(regex);
      
      if (matches && matches.length > 0) {
        // Converte para número para comparar
        const values = matches.map(m => ({
          str: m,
          num: parseFloat(m.replace(/[$,\sSEI]/gi, ''))
        }));
        
        // Retorna o maior valor
        const maxValue = values.reduce((a, b) => a.num > b.num ? a : b);
        return maxValue.str;
      }
      
      return null;
    });
    
    if (balance) {
      addCacheEntry(walletName, balance, "sei", "success");
      return balance;
    }
    
    console.log(`[SEI] No balance found for ${walletName}`);
    return null;
  } catch (error) {
    console.error(`[SEI] Error extracting balance for ${walletName}:`, error);
    return null;
  }
}

/**
 * Busca o saldo de um wallet blockchain
 */
export async function fetchBlockchainBalance(config: BlockchainWalletConfig, attempt: number = 1): Promise<BlockchainBalance> {
  const maxAttempts = 3;
  
  try {
    console.log(`[${config.blockchain.toUpperCase()}] [Attempt ${attempt}/${maxAttempts}] Fetching balance for ${config.name}`);
    
    let browser: any = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
      });
      
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(30000);
      page.setDefaultTimeout(30000);
      
      // Navegar para a página
      await page.goto(config.link, { waitUntil: "networkidle2", timeout: 30000 });
      
      let balance: string | null = null;
      
      // Extrair o valor dependendo do blockchain
      switch (config.blockchain) {
        case "starknet":
          balance = await extractStarknetBalance(page, config.name);
          break;
        case "aptos":
          balance = await extractAptosBalance(page, config.name);
          break;
        case "sei":
          balance = await extractSeiBalance(page, config.name);
          break;
      }
      
      await browser.close();
      
      if (balance) {
        return {
          name: config.name,
          link: config.link,
          balance,
          lastUpdated: new Date(),
          status: "success",
        };
      }
      
      // Se falhou e não está na última tentativa, tentar novamente
      if (attempt < maxAttempts) {
        console.log(`[${config.blockchain.toUpperCase()}] Retrying (${attempt + 1}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return fetchBlockchainBalance(config, attempt + 1);
      }
      
      throw new Error("Could not extract balance from page");
    } catch (puppeteerError) {
      if (browser) await browser.close().catch(() => {});
      throw puppeteerError;
    }
  } catch (error) {
    console.error(`[${config.blockchain.toUpperCase()}] Error fetching balance for ${config.name}:`, error);
    
    // Retry up to maxAttempts
    if (attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return fetchBlockchainBalance(config, attempt + 1);
    }
    
    return {
      name: config.name,
      link: config.link,
      balance: "N/A",
      lastUpdated: new Date(),
      status: "temporary_error",
      error: String(error),
    };
  }
}

/**
 * Busca os saldos de múltiplos wallets blockchain
 */
export async function fetchMultipleBlockchainBalances(
  configs: BlockchainWalletConfig[]
): Promise<BlockchainBalance[]> {
  const results: BlockchainBalance[] = [];
  
  for (const config of configs) {
    const result = await fetchBlockchainBalance(config);
    results.push(result);
  }
  
  return results;
}
