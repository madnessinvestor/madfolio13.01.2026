import { MetricCard } from "@/components/dashboard/MetricCard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { ExposureCard } from "@/components/dashboard/ExposureCard";
import { AddInvestmentDialog, type Investment } from "@/components/dashboard/AddInvestmentDialog";
import { Wallet, TrendingUp, PiggyBank, Percent, Building2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayCurrency } from "@/App";
import { useCurrencyConverter } from "@/components/CurrencySwitcher";

interface PortfolioSummary {
  totalValue: number;
  cryptoValue: number;
  traditionalValue: number;
  realEstateValue: number;
  cryptoExposure: number;
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

  const handleAddInvestment = (investment: Omit<Investment, "id" | "currentPrice">) => {
    createInvestmentMutation.mutate(investment);
  };

  const totalPortfolio = summary?.totalValue || 0;
  const cryptoValue = summary?.cryptoValue || 0;
  const traditionalValue = summary?.traditionalValue || 0;
  const realEstateValue = summary?.realEstateValue || 0;
  const cryptoExposure = summary?.cryptoExposure || 0;

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

  const format = (value: number) => formatCurrency(value, displayCurrency);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu portfólio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddInvestmentDialog onAdd={handleAddInvestment} isLoading={createInvestmentMutation.isPending} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
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
            title="Tradicional"
            value={format(traditionalValue)}
            icon={PiggyBank}
          />
          <MetricCard
            title="Imóveis"
            value={format(realEstateValue)}
            icon={Building2}
          />
          <MetricCard
            title="Exposição Cripto"
            value={`${cryptoExposure.toFixed(1)}%`}
            icon={Percent}
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
          traditionalValue={traditionalValue} 
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
                { name: "Mercado Tradicional", value: traditionalValue, color: "hsl(var(--chart-2))" },
                { name: "Imóveis", value: realEstateValue, color: "hsl(var(--chart-3))" },
              ].filter(d => d.value > 0)}
            />
          </>
        ) : (
          <div className="lg:col-span-2 h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
            Adicione ativos e lançamentos para ver a distribuição do portfólio
          </div>
        )}
      </div>
    </div>
  );
}
