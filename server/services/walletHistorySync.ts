import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const HISTORY_FILE = path.join(process.cwd(), 'data', 'wallet-history.json');
const DATA_DIR = path.join(process.cwd(), 'data');

export interface WalletHistoryEntry {
  id: string;
  name: string;
  balance: string;
  lastUpdated: string;
  status: string;
  platform?: string;
}

// Garantir que a pasta data existe
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Carregar histórico do arquivo JSON
export function loadHistoryFromFile(): Map<string, WalletHistoryEntry> {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf-8');
      const entries = JSON.parse(data) as WalletHistoryEntry[];
      const map = new Map<string, WalletHistoryEntry>();
      entries.forEach(entry => map.set(entry.name, entry));
      console.log(`[GitSync] ✅ Carregados ${entries.length} registros do histórico`);
      return map;
    }
  } catch (error) {
    console.error('[GitSync] ❌ Erro ao carregar histórico:', error);
  }
  return new Map();
}

// Salvar histórico no arquivo JSON
export function saveHistoryToFile(history: Map<string, WalletHistoryEntry>): boolean {
  try {
    const entries = Array.from(history.values());
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8');
    console.log(`[GitSync] 💾 Salvos ${entries.length} registros no arquivo`);
    return true;
  } catch (error) {
    console.error('[GitSync] ❌ Erro ao salvar histórico:', error);
    return false;
  }
}

// Fazer commit e push para GitHub
export async function syncToGitHub(message: string = 'Update wallet history'): Promise<boolean> {
  // Skip git operations in Replit environment to avoid auth prompts
  if (process.env.REPL_ID) {
    console.log('[GitSync] Skipping git sync in Replit environment');
    return true;
  }
  
  try {
    // Verificar se há mudanças
    const status = execSync('git status --porcelain data/wallet-history.json', { encoding: 'utf-8' });
    
    if (!status.trim()) {
      console.log('[GitSync] ℹ️ Nenhuma mudança para sincronizar');
      return true;
    }

    console.log('[GitSync] 🔄 Sincronizando com GitHub...');
    
    // Configurar git (necessário em alguns ambientes)
    try {
      execSync('git config user.email "wallet-tracker@madfolio.app"', { encoding: 'utf-8' });
      execSync('git config user.name "Wallet Tracker Bot"', { encoding: 'utf-8' });
    } catch (e) {
      // Ignorar se já configurado
    }

    // Add, commit e push
    execSync('git add data/wallet-history.json', { encoding: 'utf-8' });
    execSync(`git commit -m "${message}"`, { encoding: 'utf-8' });
    execSync('git push origin main', { encoding: 'utf-8' });
    
    console.log('[GitSync] ✅ Sincronizado com GitHub!');
    return true;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
    console.error('[GitSync] ❌ Erro ao sincronizar:', errorMsg);
    return false;
  }
}

// Pull do GitHub (para quando servidor iniciar)
export async function pullFromGitHub(): Promise<boolean> {
  // Skip git operations in Replit environment to avoid auth prompts
  if (process.env.REPL_ID) {
    console.log('[GitSync] Skipping git pull in Replit environment');
    return true;
  }
  
  try {
    console.log('[GitSync] ⬇️ Baixando histórico do GitHub...');
    execSync('git pull origin main --no-rebase', { encoding: 'utf-8' });
    console.log('[GitSync] ✅ Histórico atualizado do GitHub!');
    return true;
  } catch (error) {
    console.error('[GitSync] ⚠️ Erro ao fazer pull (normal se não houver mudanças)');
    return false;
  }
}
