import { useState, useRef } from "react";
import { HoldingsTable, type Holding } from "@/components/dashboard/HoldingsTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { AddInvestmentDialog, type Investment } from "@/components/dashboard/AddInvestmentDialog";
import { EditInvestmentDialog } from "@/components/dashboard/EditInvestmentDialog";
import { Landmark, TrendingUp, Briefcase } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayCurrency } from "@/hooks/use-currency";
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

export default function FixedIncomePage() {
  const { toast } = useToast();
  const { displayCurrency, isBalanceHidden } = useDisplayCurrency();
  const { formatCurrency } = useCurrencyConverter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; symbol: string } | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | undefined>(undefined);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const dialogRef = useRef<any>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
  });

  const createInvestmentMutation = useMutation({
    mutationFn: async (investment: Omit<Investment, "id" | "currentPrice">) => {
      return apiRequest("POST", "/api/assets", { ...investment, currency: "BRL" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Investimento adicionado",
        description: "O investimento foi cadastrado com sucesso.",
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
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Ativo removido",
        description: "O ativo foi removido do portfólio.",
      });
    },
  });

  const fixedIncomeHoldings = summary?.holdings.filter((h) => h.market === "fixed_income") || [];

  const holdings: Holding[] = fixedIncomeHoldings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.quantity || 0,
    avgPrice: h.acquisitionPrice || 0,
    currentPrice: h.currentPrice || 0,
    change24h: h.profitLossPercent || 0,
    type: "stock",
  }));

  const handleAddInvestment = async (investment: Omit<Investment, "id" | "currentPrice">) => {
    const totalValue = investment.quantity * investment.acquisitionPrice;
    await apiRequest("POST", "/api/activities", {
      type: "create",
      category: "asset",
      assetName: investment.name,
      assetSymbol: investment.symbol,
      action: `Adicionado ${investment.quantity} unidade(s)`,
      details: `Quantidade: ${investment.quantity}, Valor Total: R$ ${totalValue.toFixed(2)}`,
    }).catch(() => {});
    createInvestmentMutation.mutate(investment);
    setEditingAssetId(undefined);
  };

  const handleEdit = (holding: Holding) => {
    setEditingAssetId(holding.id);
    setEditDialogOpen(true);
  };

  const handleDelete = (holding: Holding) => {
    setAssetToDelete({ id: holding.id, symbol: holding.symbol });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (assetToDelete) {
      const assetToDeleteData = fixedIncomeHoldings.find(h => h.id === assetToDelete.id);
      if (assetToDeleteData) {
        const totalValue = assetToDeleteData.quantity * assetToDeleteData.currentPrice;
        await apiRequest("POST", "/api/activities", {
          type: "delete",
          category: "asset",
          assetName: assetToDeleteData.name,
          assetSymbol: assetToDeleteData.symbol,
          action: `Removido ${assetToDeleteData.quantity} unidade(s)`,
          details: `Quantidade: ${assetToDeleteData.quantity}, Valor Total: R$ ${totalValue.toFixed(2)}`,
        }).catch(() => {});
      }
      deleteAssetMutation.mutate(assetToDelete.id);
    }
    setDeleteDialogOpen(false);
    setAssetToDelete(null);
  };

  const totalValue = summary?.fixedIncomeValue || 0;

  const categoryTotals: Record<string, number> = {};
  fixedIncomeHoldings.forEach((h) => {
    const cat = h.category === "fixed_income" ? "Renda Fixa" :
                h.category === "cash" ? "Caixa" : "Outros";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + h.value;
  });

  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({
    name,
    value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const format = (value: number) => isBalanceHidden ? '***' : formatCurrency(value, displayCurrency);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Renda Fixa</h1>
          <p className="text-muted-foreground">Investimentos com rendimento fixo e previsível</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddInvestmentDialog 
            onAdd={handleAddInvestment} 
            onAddSnapshot={() => {}} 
            isLoading={createInvestmentMutation.isPending}
            initialEditAssetId={editingAssetId}
            existingAssets={summary?.holdings.map(h => ({ id: h.id, symbol: h.symbol, name: h.name, market: h.market })) || []}
          />
        </div>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <MetricCard
            title="Valor Total"
            value={format(totalValue)}
            icon={Landmark}
          />
          <MetricCard
            title="Exposição Renda Fixa"
            value={`${((fixedIncomeHoldings.length > 0 ? (totalValue / (summary?.totalValue || 1)) : 0) * 100).toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Ativos"
            value={fixedIncomeHoldings.length.toString()}
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
              title="Holdings Renda Fixa"
              holdings={holdings}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isHidden={isBalanceHidden}
              fixedIncome={true}
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

      {editingAssetId && (
        <EditInvestmentDialog
          assetId={editingAssetId}
          open={editDialogOpen}
          onOpenChange={(open) => {
            setEditDialogOpen(open);
            if (!open) setEditingAssetId(undefined);
          }}
        />
      )}
    </div>
  );
}
