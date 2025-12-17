import { useState } from "react";
import { HoldingsTable, type Holding } from "@/components/dashboard/HoldingsTable";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { PortfolioChart } from "@/components/dashboard/PortfolioChart";
import { AddRealEstateDialog, type RealEstateAsset } from "@/components/dashboard/AddRealEstateDialog";
import { Building2, TrendingUp, Home } from "lucide-react";
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
  realEstateValue: number;
  cryptoExposure: number;
  holdings: Array<{
    id: string;
    symbol: string;
    name: string;
    category: string;
    market: string;
    value: number;
    quantity?: number;
    acquisitionPrice?: number;
  }>;
}

export default function RealEstatePage() {
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assetToDelete, setAssetToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<RealEstateAsset[]>({
    queryKey: ["/api/assets", "real_estate"],
    queryFn: async () => {
      const res = await fetch("/api/assets?market=real_estate");
      if (!res.ok) throw new Error("Failed to fetch assets");
      return res.json();
    },
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
  });

  const createAssetMutation = useMutation({
    mutationFn: async (asset: Omit<RealEstateAsset, "id">) => {
      return apiRequest("POST", "/api/investments", {
        ...asset,
        market: "real_estate",
        category: "real_estate",
        currency: "BRL",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      toast({
        title: "Imóvel adicionado",
        description: "O imóvel foi cadastrado com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o imóvel.",
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
        title: "Imóvel removido",
        description: "O imóvel foi removido do portfólio.",
      });
    },
  });

  const realEstateHoldings = summary?.holdings.filter((h) => h.market === "real_estate") || [];

  const holdings: Holding[] = realEstateHoldings.map((h) => ({
    id: h.id,
    symbol: h.symbol,
    name: h.name,
    amount: h.quantity || 1,
    avgPrice: h.acquisitionPrice || 0,
    currentPrice: h.acquisitionPrice || 0,
    change24h: 0,
    type: "real_estate",
  }));

  const handleAddAsset = (asset: Omit<RealEstateAsset, "id">) => {
    createAssetMutation.mutate(asset);
  };

  const handleEdit = (holding: Holding) => {
    toast({
      title: "Editar imóvel",
      description: `Funcionalidade de edição para ${holding.name} em desenvolvimento.`,
    });
  };

  const handleDelete = (holding: Holding) => {
    setAssetToDelete({ id: holding.id, name: holding.name });
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (assetToDelete) {
      deleteAssetMutation.mutate(assetToDelete.id);
    }
    setDeleteDialogOpen(false);
    setAssetToDelete(null);
  };

  const totalValue = summary?.realEstateValue || 0;
  const totalPortfolio = summary?.totalValue || 0;
  const realEstateExposure = totalPortfolio > 0 ? (totalValue / totalPortfolio) * 100 : 0;

  const chartData = realEstateHoldings.map((h, index) => ({
    name: h.name,
    value: h.value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const isLoading = assetsLoading || summaryLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Imóveis</h1>
          <p className="text-muted-foreground">Seus investimentos em imóveis</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddRealEstateDialog onAdd={handleAddAsset} isLoading={createAssetMutation.isPending} />
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
            title="Valor Total em Imóveis"
            value={`R$ ${totalValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`}
            icon={Building2}
          />
          <MetricCard
            title="Exposição em Imóveis"
            value={`${realEstateExposure.toFixed(1)}%`}
            icon={TrendingUp}
          />
          <MetricCard
            title="Imóveis"
            value={realEstateHoldings.length.toString()}
            icon={Home}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {isLoading ? (
            <Skeleton className="h-96 rounded-lg" />
          ) : holdings.length > 0 ? (
            <HoldingsTable
              title="Meus Imóveis"
              holdings={holdings}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ) : (
            <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
              Adicione imóveis para vê-los aqui
            </div>
          )}
        </div>
        {chartData.length > 0 ? (
          <PortfolioChart title="Distribuição de Imóveis" data={chartData} />
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
              Tem certeza que deseja remover {assetToDelete?.name} do seu portfólio?
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
