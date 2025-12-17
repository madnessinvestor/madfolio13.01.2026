import { useState } from "react";
import { HoldingsTable, type Holding } from "@/components/dashboard/HoldingsTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CategoryChart } from "@/components/dashboard/CategoryChart";
import { AddAssetDialog, type Asset } from "@/components/dashboard/AddAssetDialog";
import { SnapshotDialog, type Snapshot } from "@/components/dashboard/SnapshotDialog";
import { Landmark, TrendingUp, Briefcase } from "lucide-react";
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

export default function TraditionalPage() {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; symbol: string } | null>(null);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets", "traditional"],
    queryFn: async () => {
      const res = await fetch("/api/assets?market=traditional");
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

  const traditionalHoldings = summary?.holdings.filter((h) => h.market === "traditional") || [];

  const holdings: Holding[] = traditionalHoldings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.amount || 0,
    avgPrice: h.unitPrice || 0,
    currentPrice: h.unitPrice || 0,
    change24h: 0,
    type: h.category === "fii" ? "fii" : h.category === "etf" ? "etf" : "stock",
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

  const totalValue = summary?.traditionalValue || 0;

  const categoryTotals: Record<string, number> = {};
  traditionalHoldings.forEach((h) => {
    const cat = h.category === "stocks" ? "Ações" : 
                h.category === "fixed_income" ? "Renda Fixa" :
                h.category === "fii" ? "FIIs" :
                h.category === "cash" ? "Caixa" :
                h.category === "etf" ? "ETFs" : "Outros";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + h.value;
  });

  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({
    name,
    value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const isLoading = assetsLoading || summaryLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Mercado Tradicional</h1>
          <p className="text-muted-foreground">Ações, FIIs, Renda Fixa e Caixa</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SnapshotDialog assets={assets} onAdd={handleAddSnapshot} />
          <AddAssetDialog onAdd={handleAddAsset} defaultMarket="traditional" />
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
            title="Valor Total"
            value={`R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={Landmark}
          />
          <MetricCard
            title="Exposição Tradicional"
            value={`${(100 - (summary?.cryptoExposure || 0)).toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Ativos"
            value={traditionalHoldings.length.toString()}
            icon={Briefcase}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-96 rounded-lg" />
          ) : holdings.length > 0 ? (
            <HoldingsTable
              title="Holdings Tradicional"
              holdings={holdings}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
              Adicione ativos e registre valores para vê-los aqui
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
