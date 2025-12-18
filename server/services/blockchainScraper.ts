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
 * Procura pelo valor no canto superior esquerdo, abaixo do nome do usuário
 */
async function extractStarknetBalance(page: any, walletName: string): Promise<string | null> {
  console.log(`[STARKNET] Extracting balance for ${walletName}`);
  try {
    await page.waitForSelector("body", { timeout: 10000 });
    
    // Esperar um pouco para o JS carregar
    await page.waitForTimeout(2000);
    
    const balance = await page.evaluate(() => {
      // Procura por padrões de valor (por exemplo: "$123,456.78" ou "123456.78 ETH")
      const pageText = document.body.innerText;
      const lines = pageText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      
      // Procura por linhas que começam com $
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("$") && /[\d,]+\.?\d*/.test(lines[i])) {
          return lines[i];
        }
      }
      
      // Fallback: procura por qualquer número grande formatado
      const regex = /\$[\d,]+\.?\d*/g;
      const matches = pageText.match(regex);
      if (matches && matches.length > 0) {
        return matches[0];
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
 * Procura pelo valor abaixo de "Coin value"
 */
async function extractAptosBalance(page: any, walletName: string): Promise<string | null> {
  console.log(`[APTOS] Extracting balance for ${walletName}`);
  try {
    await page.waitForSelector("body", { timeout: 10000 });
    
    // Esperar um pouco para o JS carregar
    await page.waitForTimeout(2000);
    
    const balance = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const lines = pageText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      
      // Procura por "Coin value" ou similar
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes("coin value") || lines[i].toLowerCase().includes("total value")) {
          // O valor deve estar nas próximas linhas
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            if (/[\d,]+\.?\d*/.test(lines[j]) || lines[j].startsWith("$")) {
              return lines[j];
            }
          }
        }
      }
      
      // Fallback: procura por padrões de valor
      const regex = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(APTOS|APT)?/g;
      const matches = pageText.match(regex);
      if (matches && matches.length > 0) {
        return matches[0];
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
 * Procura pelo valor abaixo de "SEI Value"
 */
async function extractSeiBalance(page: any, walletName: string): Promise<string | null> {
  console.log(`[SEI] Extracting balance for ${walletName}`);
  try {
    await page.waitForSelector("body", { timeout: 10000 });
    
    // Esperar um pouco para o JS carregar
    await page.waitForTimeout(2000);
    
    const balance = await page.evaluate(() => {
      const pageText = document.body.innerText;
      const lines = pageText.split("\n").map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      
      // Procura por "SEI Value" ou "SEI Balance"
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes("sei value") || lines[i].toLowerCase().includes("sei balance")) {
          // O valor deve estar nas próximas linhas
          for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
            if (/[\d,]+\.?\d*/.test(lines[j]) || lines[j].startsWith("$")) {
              return lines[j];
            }
          }
        }
      }
      
      // Fallback: procura por padrões de valor SEI
      const regex = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(SEI)?/g;
      const matches = pageText.match(regex);
      if (matches && matches.length > 0) {
        return matches[0];
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
    
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(30000);
    
    // Navegar para a página
    await page.goto(config.link, { waitUntil: "networkidle2" });
    
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
