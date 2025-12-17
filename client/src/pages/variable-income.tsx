import { useState } from "react";
import { HoldingsTable, type Holding } from "@/components/dashboard/HoldingsTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { AddInvestmentDialog, type Investment, type Snapshot } from "@/components/dashboard/AddInvestmentDialog";
import { TrendingUp, Briefcase, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayCurrency } from "@/App";
import { useCurrencyConverter } from "@/components/CurrencySwitcher";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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

export default function VariableIncomePage() {
  const { toast } = useToast();
  const { displayCurrency } = useDisplayCurrency();
  const { formatCurrency } = useCurrencyConverter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; symbol: string } | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
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

  const deleteAssetMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/assets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      toast({
        title: "Ativo removido",
        description: "O ativo foi removido do portfólio.",
      });
    },
  });

  const variableIncomeHoldings = summary?.holdings.filter((h) => h.market === "variable_income") || [];

  const holdings: Holding[] = variableIncomeHoldings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.quantity || 0,
    avgPrice: h.acquisitionPrice || 0,
    currentPrice: h.currentPrice || 0,
    change24h: h.profitLossPercent || 0,
    type: h.category === "fii" ? "fii" : h.category === "etf" ? "etf" : "stock",
  }));

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

  const handleEdit = (holding: Holding) => {
    toast({
      title: "Editar ativo",
      description: `Use o botão "Adicionar Investimento" para atualizar ${holding.symbol}.`,
    });
  };

  const handleDelete = (holding: Holding) => {
    setAssetToDelete({ id: holding.id, symbol: holding.symbol });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (assetToDelete) {
      deleteAssetMutation.mutate(assetToDelete.id);
    }
    setDeleteDialogOpen(false);
    setAssetToDelete(null);
  };

  const totalValue = summary?.variableIncomeValue || 0;

  const categoryTotals: Record<string, number> = {};
  variableIncomeHoldings.forEach((h) => {
    const cat = h.category === "stocks" ? "Ações" : 
                h.category === "fii" ? "FIIs" :
                h.category === "etf" ? "ETFs" : "Outros";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + h.value;
  });

  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({
    name,
    value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const format = (value: number) => formatCurrency(value, displayCurrency);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Renda Variável</h1>
          <p className="text-muted-foreground">Ações, FIIs e ETFs com preços atualizados automaticamente</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddInvestmentDialog onAdd={handleAddInvestment} onAddSnapshot={handleAddSnapshot} isLoading={createInvestmentMutation.isPending || createSnapshotMutation.isPending} />
        </div>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <MetricCard
            title="Valor Total"
            value={format(totalValue)}
            icon={BarChart3}
          />
          <MetricCard
            title="Ativos"
            value={variableIncomeHoldings.length.toString()}
            icon={Briefcase}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {summaryLoading ? (
            <Skeleton className="h-96 rounded-lg" />
          ) : holdings.length > 0 ? (
            <HoldingsTable
              title="Holdings Renda Variável"
              holdings={holdings}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
              Adicione investimentos para vê-los aqui
            </div>
          )}
        </div>
        {categoryData.length > 0 ? (
          <CategoryChart title="Por Categoria" data={categoryData} />
        ) : (
          <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
            Sem dados para exibir
          </div>
        )}
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover {assetToDelete?.symbol} do seu portfólio?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
