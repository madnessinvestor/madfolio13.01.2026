import { useState } from "react";
import { HoldingsTable, type Holding } from "@/components/dashboard/HoldingsTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { AddAssetDialog, type Asset } from "@/components/dashboard/AddAssetDialog";
import { SnapshotDialog, type Snapshot } from "@/components/dashboard/SnapshotDialog";
import { Bitcoin, TrendingUp, Coins } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
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
    amount?: number;
    unitPrice?: number;
  }>;
}

export default function CryptoPage() {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; symbol: string } | null>(null);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets", "crypto"],
    queryFn: async () => {
      const res = await fetch("/api/assets?market=crypto");
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
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
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async (snapshot: Omit<Snapshot, "id">) => {
      return apiRequest("POST", "/api/snapshots", snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Lançamento registrado",
        description: "O valor foi atualizado com sucesso.",
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

  const cryptoHoldings = summary?.holdings.filter((h) => h.market === "crypto") || [];

  const holdings: Holding[] = cryptoHoldings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.amount || 0,
    avgPrice: h.unitPrice || 0,
    currentPrice: h.unitPrice || 0,
    change24h: 0,
    type: "crypto",
  }));

  const handleAddAsset = (asset: Omit<Asset, "id">) => {
    createAssetMutation.mutate(asset);
  };

  const handleAddSnapshot = (snapshot: Omit<Snapshot, "id">) => {
    createSnapshotMutation.mutate(snapshot);
  };

  const handleEdit = (holding: Holding) => {
    toast({
      title: "Editar ativo",
      description: `Use "Novo Lançamento" para atualizar o valor de ${holding.symbol}.`,
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

  const totalValue = summary?.cryptoValue || 0;

  const chartData = cryptoHoldings.map((h, index) => ({
    name: h.symbol,
    value: h.value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const isLoading = assetsLoading || summaryLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mercado Cripto</h1>
          <p className="text-muted-foreground">Seus investimentos em criptomoedas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SnapshotDialog assets={assets} onAdd={handleAddSnapshot} />
          <AddAssetDialog onAdd={handleAddAsset} defaultMarket="crypto" />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <MetricCard
            title="Valor Total Cripto"
            value={`R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={Bitcoin}
          />
          <MetricCard
            title="Exposição Cripto"
            value={`${(summary?.cryptoExposure || 0).toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Ativos"
            value={cryptoHoldings.length.toString()}
            icon={Coins}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-96 rounded-lg" />
          ) : holdings.length > 0 ? (
            <HoldingsTable
              title="Holdings Cripto"
              holdings={holdings}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
              Adicione ativos cripto e registre valores para vê-los aqui
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
