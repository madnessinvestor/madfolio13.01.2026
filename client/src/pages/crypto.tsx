import { useState, useRef, useEffect } from "react";
import { HoldingsTable, type Holding } from "@/components/dashboard/HoldingsTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { AddInvestmentDialog, type Investment, type Snapshot } from "@/components/dashboard/AddInvestmentDialog";
import { EditInvestmentDialog } from "@/components/dashboard/EditInvestmentDialog";
import { Bitcoin, TrendingUp, Coins } from "lucide-react";
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

export default function CryptoPage() {
  const { toast } = useToast();
  const { displayCurrency, isBalanceHidden } = useDisplayCurrency();
  const { formatCurrency } = useCurrencyConverter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; symbol: string } | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | undefined>(undefined);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  const { data: summary, isLoading: summaryLoading, refetch } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
    staleTime: 0,
    refetchInterval: 5 * 60 * 1000, // Auto-refetch every 5 minutes
    refetchOnMount: true, // Refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Refetch on component mount to ensure latest prices
  useEffect(() => {
    refetch();
  }, [refetch]);

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
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Ativo removido",
        description: "O ativo foi removido do portfólio.",
      });
    },
  });

  const cryptoHoldings = summary?.holdings.filter((h) => h.market === "crypto") || [];
  const holdingsCripto = summary?.holdings.filter((h) => h.market === "crypto") || [];
  const walletsCripto = summary?.holdings.filter((h) => h.market === "crypto_simplified") || [];

  const holdings: Holding[] = cryptoHoldings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.quantity || 0,
    avgPrice: h.acquisitionPrice || 0,
    currentPrice: h.currentPrice || 0,
    change24h: h.profitLossPercent || 0,
    type: "crypto",
  }));

  const holdingsCriptoFormatted: Holding[] = holdingsCripto.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.quantity || 0,
    avgPrice: h.acquisitionPrice || 0,
    currentPrice: h.currentPrice || 0,
    change24h: h.profitLossPercent || 0,
    type: "crypto",
  }));

  const walletsCriptoFormatted: Holding[] = walletsCripto.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.quantity || 0,
    avgPrice: h.acquisitionPrice || 0,
    currentPrice: h.currentPrice || 0,
    change24h: h.profitLossPercent || 0,
    type: "crypto",
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

  const handleAddSnapshot = (snapshot: Snapshot) => {
    createSnapshotMutation.mutate(snapshot);
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
      const assetToDeleteData = cryptoHoldings.find(h => h.id === assetToDelete.id);
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

  const allCryptoAssets = [...holdingsCripto, ...walletsCripto];
  const totalValueFromAssets = allCryptoAssets.reduce((sum, h) => sum + (h.value || 0), 0);
  const totalValue = totalValueFromAssets || summary?.cryptoValue || 0;
  const totalAssetCount = holdingsCripto.length + walletsCripto.length;

  const chartData = allCryptoAssets.map((h, index) => ({
    name: h.symbol,
    value: h.value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const format = (value: number) => isBalanceHidden ? '***' : formatCurrency(value, displayCurrency);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mercado Cripto</h1>
          <p className="text-muted-foreground">Seus investimentos em criptomoedas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddInvestmentDialog 
            onAdd={handleAddInvestment} 
            onAddSnapshot={handleAddSnapshot} 
            isLoading={createInvestmentMutation.isPending || createSnapshotMutation.isPending}
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
            title="Valor Total Cripto"
            value={format(totalValue)}
            icon={Bitcoin}
          />
          <MetricCard
            title="Exposição Cripto"
            value={`${((totalValue / (summary?.totalValue || 1)) * 100).toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Ativos"
            value={totalAssetCount.toString()}
            icon={Coins}
          />
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {summaryLoading ? (
              <Skeleton className="h-96 rounded-lg" />
            ) : holdingsCriptoFormatted.length > 0 ? (
              <HoldingsTable
                title="Holdings Cripto"
                holdings={holdingsCriptoFormatted}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isHidden={isBalanceHidden}
                cryptoType="holdings"
              />
            ) : (
              <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
                Nenhum ativo em Holdings Cripto
              </div>
            )}
          </div>
          {chartData.length > 0 ? (
            <PortfolioChart title="Distribuição Cripto" data={chartData} />
          ) : (
            <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
              Sem dados para exibir
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-6">
          {summaryLoading ? (
            <Skeleton className="h-96 rounded-lg" />
          ) : walletsCriptoFormatted.length > 0 ? (
            <HoldingsTable
              title="Wallets Cripto"
              holdings={walletsCriptoFormatted}
              onEdit={handleEdit}
              onDelete={handleDelete}
              isHidden={isBalanceHidden}
              cryptoType="wallets"
            />
          ) : (
            <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
              Nenhum ativo em Wallets Cripto
            </div>
          )}
        </div>
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
