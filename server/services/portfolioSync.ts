/**
 * Serviço de sincronização automática da Evolução do Portfólio
 * 
 * Consolida valores de:
 * - Renda Fixa (Holdings Renda Fixa)
 * - Renda Variável (Holdings Renda Variável)
 * - Mercado Cripto (Holdings Cripto + Wallets Cripto)
 * - Imóveis (Meus Imóveis)
 * 
 * Atualiza automaticamente os snapshots mensais não bloqueados
 */

import { storage } from '../storage';
import { fetchExchangeRates } from './exchangeRate';
import { getDetailedBalances } from './debankScraper';

/**
 * Calcula o valor total consolidado de todos os investimentos
 */
async function calculateConsolidatedPortfolioValue(userId: string = "default-user"): Promise<number> {
  try {
    console.log(`[Portfolio Sync] Starting consolidated value calculation for user: ${userId}`);
    
    // Obter todas as holdings (assets) do usuário
    const allAssets = await storage.getAssets(userId);
    const rates = await fetchExchangeRates();
    
    let totalValue = 0;
    
    // 1. Consolidar Holdings: Renda Fixa, Renda Variável e Holdings Cripto
    for (const asset of allAssets) {
      const currentPrice = asset.currentPrice || asset.acquisitionPrice || 0;
      const quantity = asset.quantity || 0;
      const currency = asset.currency || "BRL";
      
      const valueInCurrency = quantity * currentPrice;
      const exchangeRate = rates[currency as keyof typeof rates] || 1;
      const valueInBRL = valueInCurrency * exchangeRate;
      
      totalValue += valueInBRL;
      
      console.log(`[Portfolio Sync] Asset ${asset.symbol} (${asset.market}): R$ ${valueInBRL.toFixed(2)}`);
    }
    
    console.log(`[Portfolio Sync] Total from holdings: R$ ${totalValue.toFixed(2)}`);
    
    // 2. Adicionar valores das Wallets Cripto (que não estão em holdings)
    try {
      const walletBalances = await getDetailedBalances();
      
      for (const wallet of walletBalances) {
        if (wallet.status === 'success' && wallet.balance) {
          // Parse do valor (já deve estar em BRL após a conversão)
          const walletValue = parseFloat(wallet.balance.replace(/[^\d.-]/g, '')) || 0;
          
          if (walletValue > 0) {
            // Verificar se já não está contado em holdings
            const matchingAsset = allAssets.find(asset => 
              (asset.market === 'crypto' || asset.market === 'crypto_simplified') &&
              asset.name.toLowerCase() === wallet.name.toLowerCase()
            );
            
            if (!matchingAsset) {
              // Wallet não está em holdings, adicionar ao total
              totalValue += walletValue;
              console.log(`[Portfolio Sync] Wallet ${wallet.name}: R$ ${walletValue.toFixed(2)} (not in holdings)`);
            } else {
              console.log(`[Portfolio Sync] Wallet ${wallet.name}: Already counted in holdings`);
            }
          }
        }
      }
    } catch (error) {
      console.error(`[Portfolio Sync] Error fetching wallet balances:`, error);
    }
    
    console.log(`[Portfolio Sync] ✓ Total consolidated value: R$ ${totalValue.toFixed(2)}`);
    
    return totalValue;
  } catch (error) {
    console.error(`[Portfolio Sync] Error calculating consolidated value:`, error);
    return 0;
  }
}

/**
 * Sincroniza automaticamente a Evolução do Portfólio
 * Atualiza apenas meses não bloqueados (snapshots não salvos)
 */
export async function syncPortfolioEvolution(userId: string = "default-user"): Promise<void> {
  try {
    console.log(`[Portfolio Sync] ========================================`);
    console.log(`[Portfolio Sync] Starting automatic portfolio evolution sync`);
    
    // Calcular valor consolidado total
    const totalValue = await calculateConsolidatedPortfolioValue(userId);
    
    if (totalValue === 0) {
      console.log(`[Portfolio Sync] ⊗ Total value is zero, skipping sync`);
      console.log(`[Portfolio Sync] ========================================`);
      return;
    }
    
    // Obter mês e ano atuais
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const currentYear = currentDate.getFullYear();
    
    console.log(`[Portfolio Sync] Current period: ${currentYear}-${currentMonth.toString().padStart(2, '0')}`);
    
    // Atualizar snapshots para anos 2025-2030
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (let year = 2025; year <= 2030; year++) {
      try {
        // Verificar se o mês está bloqueado (salvo)
        const existingSnapshot = await storage.getMonthlyPortfolioSnapshot(userId, currentMonth, year);
        
        if (existingSnapshot && existingSnapshot.isLocked === 1) {
          console.log(`[Portfolio Sync] ⊗ ${year}-${currentMonth.toString().padStart(2, '0')}: LOCKED (snapshot saved) - skipped`);
          skippedCount++;
          continue;
        }
        
        // Mês não está bloqueado, pode atualizar
        await storage.createOrUpdateMonthlyPortfolioSnapshot({
          userId,
          year,
          month: currentMonth,
          totalValue,
          isLocked: 0
        });
        
        console.log(`[Portfolio Sync] ✓ ${year}-${currentMonth.toString().padStart(2, '0')}: Updated to R$ ${totalValue.toFixed(2)}`);
        updatedCount++;
        
      } catch (error) {
        console.error(`[Portfolio Sync] ✗ Error updating snapshot for ${year}-${currentMonth}:`, error);
      }
    }
    
    console.log(`[Portfolio Sync] ========================================`);
    console.log(`[Portfolio Sync] ✓ Sync completed: ${updatedCount} updated, ${skippedCount} locked (preserved)`);
    console.log(`[Portfolio Sync] ========================================`);
    
  } catch (error) {
    console.error(`[Portfolio Sync] ✗ Error in portfolio evolution sync:`, error);
  }
}

/**
 * Sincroniza também o portfolio history (gráfico de evolução)
 */
export async function syncPortfolioHistory(userId: string = "default-user"): Promise<void> {
  try {
    const totalValue = await calculateConsolidatedPortfolioValue(userId);
    
    if (totalValue === 0) {
      console.log(`[Portfolio History] Total value is zero, skipping history sync`);
      return;
    }
    
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentYear = currentDate.getFullYear();
    
    // Atualizar portfolio history para o mês atual
    await storage.createOrUpdatePortfolioHistory({
      userId,
      totalValue,
      month: currentMonth,
      year: currentYear,
      date: new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0]
    });
    
    console.log(`[Portfolio History] ✓ Updated history for ${currentYear}-${currentMonth}: R$ ${totalValue.toFixed(2)}`);
    
  } catch (error) {
    console.error(`[Portfolio History] Error updating portfolio history:`, error);
  }
}
