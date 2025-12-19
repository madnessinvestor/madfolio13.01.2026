import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Calendar } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";

interface Asset {
  id: string;
  symbol: string;
  name: string;
  market: string;
  currentPrice: number;
}

interface InvestmentUpdate {
  assetId: string;
  value: number;
}

interface BulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkUpdateDialog({ open, onOpenChange }: BulkUpdateDialogProps) {
  const { toast } = useToast();
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split("T")[0]);
  const [updates, setUpdates] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: open,
  });

  useEffect(() => {
    if (assets.length > 0) {
      const initialUpdates: Record<string, string> = {};
      assets.forEach((asset) => {
        initialUpdates[asset.id] = formatCurrencyInput(asset.currentPrice || 0);
      });
      setUpdates(initialUpdates);
    }
  }, [assets]);

  const formatCurrencyInput = (value: number): string => {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatCurrencyDisplay = (val: string) => {
    const num = val.replace(/[^\d]/g, "");
    if (!num) return "";
    const formatted = (parseInt(num) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$ ${formatted}`;
  };

  const parseCurrencyValue = (val: string): number => {
    const num = val.replace(/[^\d.,]/g, "");
    return parseFloat(num.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const bulkUpdateMutation = useMutation({
    mutationFn: async (investmentUpdates: InvestmentUpdate[]) => {
      const promises = investmentUpdates.map((update) =>
        apiRequest("POST", "/api/snapshots", {
          assetId: update.assetId,
          value: update.value,
          date: updateDate,
        })
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Atualização salva",
        description: `${Object.keys(updates).length} investimentos atualizados com sucesso em ${new Date(updateDate).toLocaleDateString("pt-BR")}.`,
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar os investimentos.",
        variant: "destructive",
      });
    },
  });

  const handleUpdate = (assetId: string, value: string) => {
    setUpdates((prev) => ({
      ...prev,
      [assetId]: value,
    }));
  };

  const handleSaveAll = () => {
    const investmentUpdates: InvestmentUpdate[] = assets
      .filter((asset) => updates[asset.id])
      .map((asset) => ({
        assetId: asset.id,
        value: parseCurrencyValue(updates[asset.id]),
      }))
      .filter((update) => update.value > 0);

    if (investmentUpdates.length === 0) {
      toast({
        title: "Nenhum investimento para atualizar",
        description: "Insira valores maiores que zero.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    bulkUpdateMutation.mutate(investmentUpdates);
    setIsSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Atualizar Investimentos
          </DialogTitle>
          <DialogDescription>
            Atualize o valor de todos os seus investimentos para uma data específica. Ideal para controle mensal.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="update-date">Data da Atualização *</Label>
            <Input
              id="update-date"
              type="date"
              value={updateDate}
              onChange={(e) => setUpdateDate(e.target.value)}
              data-testid="input-bulk-update-date"
            />
          </div>

          <div className="grid gap-2">
            <Label>Investimentos ({assets.length})</Label>
            {assetsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : assets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum investimento cadastrado.</p>
            ) : (
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {assets.map((asset) => (
                    <Card key={asset.id} className="border">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">{asset.name}</p>
                            <p className="text-xs text-muted-foreground">{asset.symbol}</p>
                          </div>
                          <Input
                            value={updates[asset.id] || ""}
                            onChange={(e) => handleUpdate(asset.id, formatCurrencyDisplay(e.target.value))}
                            placeholder="R$ 0,00"
                            className="w-32 text-right text-sm"
                            data-testid={`input-bulk-update-${asset.id}`}
                          />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-bulk-update"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSaveAll}
            disabled={bulkUpdateMutation.isPending || assetsLoading}
            data-testid="button-save-bulk-update"
          >
            {bulkUpdateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Salvar Tudo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
