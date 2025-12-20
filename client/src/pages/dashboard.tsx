import { MetricCard } from "@/components/dashboard/MetricCard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { ExposureCard } from "@/components/dashboard/ExposureCard";
import { PortfolioHoldings } from "@/components/dashboard/PortfolioHoldings";
import { AddInvestmentDialog, type Investment, type Snapshot } from "@/components/dashboard/AddInvestmentDialog";
import { Wallet, TrendingUp, Landmark, BarChart3, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayCurrency } from "@/hooks/use-currency";
import { useCurrencyConverter } from "@/components/CurrencySwitcher";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

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
  variationPercent: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  const { displayCurrency, isBalanceHidden } = useDisplayCurrency();
  const { formatCurrency } = useCurrencyConverter();
  const [, navigate] = useLocation();
  
  // State for selected year in chart
  const [selectedChartYear, setSelectedChartYear] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("dashboard_selectedYear");
      return saved ? parseInt(saved) : new Date().getFullYear();
    }
    return new Date().getFullYear();
  });
  
  // Persist year selection
  useEffect(() => {
    localStorage.setItem("dashboard_selectedYear", selectedChartYear.toString());
  }, [selectedChartYear]);

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["/api/portfolio/history"],
  });

  const currentYear = new Date().getFullYear().toString();
  const { data: monthStatus = {} } = useQuery<Record<number, boolean>>({
    queryKey: ["/api/snapshots/month-status", selectedChartYear.toString()],
  });

  // Calculate variations for history
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  
  // Map month name to index (for when month is stored as string)
  const monthNameToIndex = (monthName: string): number => {
    const index = monthNames.indexOf(monthName);
    return index >= 0 ? index : parseInt(monthName) - 1;
  };
  
  // Available years: 2025-2030
  const availableYears = [2025, 2026, 2027, 2028, 2029, 2030];
  
  // Create a map of year/month to history point for quick lookup
  const historyMap = new Map<string, any>();
  history.forEach((h) => {
    const monthIndex = monthNameToIndex(h.month.toString());
    const key = `${h.year}-${monthIndex}`;
    historyMap.set(key, h);
  });
  
  // Generate 12 months for selected year
  const selectedYearData = monthNames.map((monthName, monthIndex) => {
    const key = `${selectedChartYear}-${monthIndex}`;
    const point = historyMap.get(key);
    return {
      month: monthName,
      year: selectedChartYear,
      value: point?.totalValue || 0,
      isLocked: point ? (point.isLocked === 1 || true) : false,
    };
  });
  
  // Calculate variations within the year
  const performanceData = selectedYearData
    .map((point, index, array) => {
      const prevPoint = array[index - 1];
      const variation = prevPoint && prevPoint.value > 0 ? point.value - prevPoint.value : 0;
      const variationPercent = prevPoint && prevPoint.value > 0 
        ? (variation / prevPoint.value) * 100 
        : 0;
      
      return {
        month: point.month,
        value: point.value,
        variation,
        variationPercent,
        isLocked: point.isLocked,
      };
    });

  const createInvestmentMutation = useMutation({
    mutationFn: async (investment: Omit<Investment, "id" | "currentPrice">) => {
      return apiRequest("POST", "/api/assets", { ...investment, currency: "BRL" });
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
    const cat = h.category === "crypto" || h.market === "crypto" ? "Cripto" : 
                h.category === "stocks" || h.market === "variable_income" ? "Renda Variável" : 
                h.category === "fixed_income" || h.market === "fixed_income" ? "Renda Fixa" :
                h.category === "fii" ? "FIIs" :
                h.category === "real_estate" || h.market === "real_estate" ? "Imóveis" :
                h.category === "cash" ? "Caixa" : "Outros";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + h.value;
  });

  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({
    name,
    value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
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

      <div className="space-y-4">
        {historyLoading ? (
          <Skeleton className="h-96 rounded-lg" />
        ) : performanceData.length > 0 ? (
          <PerformanceChart 
            data={performanceData}
            monthStatus={monthStatus}
            onViewDetails={() => navigate("/monthly-snapshots")}
            availableYears={availableYears}
            selectedYear={selectedChartYear}
            onYearChange={setSelectedChartYear}
          />
        ) : (
          <div className="h-96 rounded-lg border flex items-center justify-center text-muted-foreground">
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

      <PortfolioHoldings
        holdings={summary?.holdings || []}
        isLoading={summaryLoading}
        formatCurrency={format}
        isHidden={isBalanceHidden}
      />
    </div>
  );
}
