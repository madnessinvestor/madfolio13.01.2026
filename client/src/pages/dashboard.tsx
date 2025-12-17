import { MetricCard } from "@/components/dashboard/MetricCard";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { ExposureCard } from "@/components/dashboard/ExposureCard";
import { AddAssetDialog, type Asset } from "@/components/dashboard/AddAssetDialog";
import { SnapshotDialog, type Snapshot } from "@/components/dashboard/SnapshotDialog";
import { Wallet, TrendingUp, PiggyBank, Percent } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";

interface PortfolioSummary {
  totalValue: number;
  cryptoValue: number;
  traditionalValue: number;
  cryptoExposure: number;
  holdings: Array<{
    id: string;
    symbol: string;
    name: string;
    category: string;
    market: string;
    value: number;
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

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["/api/portfolio/history"],
  });

  const createAssetMutation = useMutation({
    mutationFn: async (asset: Omit<Asset, "id">) => {
      return apiRequest("POST", "/api/assets", asset);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      toast({
        title: "Ativo adicionado",
        description: "O ativo foi cadastrado com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o ativo.",
        variant: "destructive",
      });
    },
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async (snapshot: Omit<Snapshot, "id">) => {
      return apiRequest("POST", "/api/snapshots", snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statements"] });
      toast({
        title: "Lançamento registrado",
        description: "O valor foi atualizado com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível registrar o lançamento.",
        variant: "destructive",
      });
    },
  });

  const handleAddAsset = (asset: Omit<Asset, "id">) => {
    createAssetMutation.mutate(asset);
  };

  const handleAddSnapshot = (snapshot: Omit<Snapshot, "id">) => {
    createSnapshotMutation.mutate(snapshot);
  };

  const totalPortfolio = summary?.totalValue || 0;
  const cryptoValue = summary?.cryptoValue || 0;
  const traditionalValue = summary?.traditionalValue || 0;
  const cryptoExposure = summary?.cryptoExposure || 0;

  const categoryTotals: Record<string, number> = {};
  summary?.holdings.forEach((h) => {
    const cat = h.category === "crypto" ? "Cripto" : 
                h.category === "stocks" ? "Ações" : 
                h.category === "fixed_income" ? "Renda Fixa" :
                h.category === "fii" ? "FIIs" :
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

  const isLoading = assetsLoading || summaryLoading || historyLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu portfólio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SnapshotDialog assets={assets} onAdd={handleAddSnapshot} />
          <AddAssetDialog onAdd={handleAddAsset} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <MetricCard
            title="Total do Portfólio"
            value={`R$ ${totalPortfolio.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={Wallet}
          />
          <MetricCard
            title="Cripto"
            value={`R$ ${cryptoValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Tradicional"
            value={`R$ ${traditionalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={PiggyBank}
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
        <ExposureCard cryptoValue={cryptoValue} traditionalValue={traditionalValue} />
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
              ]}
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
