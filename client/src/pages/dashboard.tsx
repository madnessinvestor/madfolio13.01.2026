import { MetricCard } from "@/components/dashboard/MetricCard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { ExposureCard } from "@/components/dashboard/ExposureCard";
import { PortfolioHoldings } from "@/components/dashboard/PortfolioHoldings";
import { AddInvestmentDialog, type Investment, type Snapshot } from "@/components/dashboard/AddInvestmentDialog";
import { BulkUpdateDialog } from "@/components/dashboard/BulkUpdateDialog";
import { Wallet, TrendingUp, Landmark, BarChart3, Building2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayCurrency } from "@/App";
import { useCurrencyConverter } from "@/components/CurrencySwitcher";
import { useState } from "react";

interface PortfolioSummary {
  totalValue: number;
  cryptoValue: number;
  traditionalValue: number;
  fixedIncomeValue: number;
  variableIncomeValue: number;
  realEstateValue: number;
  holdings: Array<{
    id: string;
    symbol: string;
    name: string;
    category: string;
    market: string;
    value: number;
    quantity: number;
    acquisitionPrice: number;
    currentPrice: number;
    profitLoss: number;
    profitLossPercent: number;
  }>;
}

interface HistoryPoint {
  month: string;
  year: number;
  value: number;
  variation: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const { displayCurrency } = useDisplayCurrency();
  const { formatCurrency } = useCurrencyConverter();
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["/api/portfolio/history"],
  });

  const createInvestmentMutation = useMutation({
    mutationFn: async (investment: Omit<Investment, "id" | "currentPrice">) => {
      return apiRequest("POST", "/api/investments", { ...investment, currency: "BRL" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Investimento adicionado",
        description: "O investimento foi cadastrado e o preço atual será atualizado automaticamente.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o investimento.",
        variant: "destructive",
      });
    },
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async (snapshot: Snapshot) => {
      return apiRequest("POST", "/api/snapshots", snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Valor atualizado",
        description: "O valor do ativo foi atualizado com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o valor.",
        variant: "destructive",
      });
    },
  });

  const handleAddInvestment = (investment: Omit<Investment, "id" | "currentPrice">) => {
    createInvestmentMutation.mutate(investment);
  };

  const handleAddSnapshot = (snapshot: Snapshot) => {
    createSnapshotMutation.mutate(snapshot);
  };

  const totalPortfolio = summary?.totalValue || 0;
  const cryptoValue = summary?.cryptoValue || 0;
  const fixedIncomeValue = summary?.fixedIncomeValue || 0;
  const variableIncomeValue = summary?.variableIncomeValue || 0;
  const realEstateValue = summary?.realEstateValue || 0;

  const categoryTotals: Record<string, number> = {};
  summary?.holdings.forEach((h) => {
    const cat = h.category === "crypto" ? "Cripto" : 
                h.category === "stocks" ? "Ações" : 
                h.category === "fixed_income" ? "Renda Fixa" :
                h.category === "fii" ? "FIIs" :
                h.category === "real_estate" ? "Imóveis" :
                h.category === "cash" ? "Caixa" : "Outros";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + h.value;
  });

  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({
    name,
    value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const performanceData = history.map((h) => ({
    month: h.month,
    value: h.value,
  }));

  const isLoading = summaryLoading || historyLoading;

  const format = (value: number) => isBalanceHidden ? '***' : formatCurrency(value, displayCurrency);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu portfólio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setBulkUpdateOpen(true)}
            variant="outline"
            className="gap-2"
            data-testid="button-bulk-update"
          >
            <Calendar className="h-4 w-4" />
            Atualizar Investimentos
          </Button>
          <button
            onClick={() => setIsBalanceHidden(!isBalanceHidden)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={isBalanceHidden ? 'Mostrar saldos' : 'Ocultar saldos'}
            data-testid="button-toggle-all-balances"
          >
            {isBalanceHidden ? (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.604-1.888A3.375 3.375 0 1015.75 10.5M9.879 16.121A3 3 0 1015.75 10.5" />
              </svg>
            )}
          </button>
          <AddInvestmentDialog onAdd={handleAddInvestment} onAddSnapshot={handleAddSnapshot} isLoading={createInvestmentMutation.isPending || createSnapshotMutation.isPending} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          <MetricCard
            title="Total do Portfólio"
            value={format(totalPortfolio)}
            icon={Wallet}
          />
          <MetricCard
            title="Cripto"
            value={format(cryptoValue)}
            icon={TrendingUp}
          />
          <MetricCard
            title="Renda Fixa"
            value={format(fixedIncomeValue)}
            icon={Landmark}
          />
          <MetricCard
            title="Renda Variável"
            value={format(variableIncomeValue)}
            icon={BarChart3}
          />
          <MetricCard
            title="Imóveis"
            value={format(realEstateValue)}
            icon={Building2}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {historyLoading ? (
            <Skeleton className="h-80 rounded-lg" />
          ) : performanceData.length > 0 ? (
            <PerformanceChart data={performanceData} />
          ) : (
            <div className="h-80 rounded-lg border flex items-center justify-center text-muted-foreground">
              Adicione lançamentos para ver o gráfico de evolução
            </div>
          )}
        </div>
        <ExposureCard 
          cryptoValue={cryptoValue} 
          fixedIncomeValue={fixedIncomeValue}
          variableIncomeValue={variableIncomeValue}
          realEstateValue={realEstateValue}
          formatCurrency={format}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {categoryData.length > 0 ? (
          <>
            <CategoryChart title="Distribuição por Categoria" data={categoryData} />
            <CategoryChart
              title="Ativos por Mercado"
              data={[
                { name: "Mercado Cripto", value: cryptoValue, color: "hsl(var(--chart-1))" },
                { name: "Renda Fixa", value: fixedIncomeValue, color: "hsl(var(--chart-2))" },
                { name: "Renda Variável", value: variableIncomeValue, color: "hsl(var(--chart-3))" },
                { name: "Imóveis", value: realEstateValue, color: "hsl(var(--chart-4))" },
              ].filter(d => d.value > 0)}
            />
          </>
        ) : (
          <div className="lg:col-span-2 h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
            Adicione ativos e lançamentos para ver a distribuição do portfólio
          </div>
        )}
      </div>

      <PortfolioHoldings
        holdings={summary?.holdings || []}
        isLoading={summaryLoading}
        formatCurrency={format}
        isHidden={isBalanceHidden}
      />

      <BulkUpdateDialog open={bulkUpdateOpen} onOpenChange={setBulkUpdateOpen} />
    </div>
  );
}
