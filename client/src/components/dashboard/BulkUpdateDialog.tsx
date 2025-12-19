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
import { Loader2, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Asset {
  id: string;
  symbol: string;
  name: string;
  market: string;
  currentPrice: number;
}

interface SnapshotUpdate {
  assetId: string;
  value: number;
  date: string;
}

interface BulkUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function BulkUpdateDialog({ open, onOpenChange }: BulkUpdateDialogProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  
  const [selectedMonth, setSelectedMonth] = useState(currentMonth.toString());
  const [monthDates, setMonthDates] = useState<Record<string, string>>({});
  const [monthUpdates, setMonthUpdates] = useState<Record<string, Record<string, string>>>({});

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: open,
  });

  useEffect(() => {
    if (assets.length > 0) {
      // Initialize dates and updates for all months
      const newMonthDates: Record<string, string> = {};
      const newMonthUpdates: Record<string, Record<string, string>> = {};
      
      for (let month = 0; month < 12; month++) {
        const monthKey = month.toString();
        const lastDayOfMonth = new Date(currentYear, month + 1, 0);
        newMonthDates[monthKey] = lastDayOfMonth.toISOString().split("T")[0];
        
        newMonthUpdates[monthKey] = {};
        assets.forEach((asset) => {
          newMonthUpdates[monthKey][asset.id] = formatCurrencyInput(asset.currentPrice || 0);
        });
      }
      
      setMonthDates(newMonthDates);
      setMonthUpdates(newMonthUpdates);
    }
  }, [assets, open]);

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
    mutationFn: async (snapshotUpdates: SnapshotUpdate[]) => {
      const promises = snapshotUpdates.map((update) =>
        apiRequest("POST", "/api/snapshots", {
          assetId: update.assetId,
          value: update.value,
          date: update.date,
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
        title: "Snapshots salvos",
        description: "Todos os meses foram atualizados com sucesso.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar os snapshots.",
        variant: "destructive",
      });
    },
  });

  const handleMonthDateChange = (month: string, date: string) => {
    setMonthDates((prev) => ({
      ...prev,
      [month]: date,
    }));
  };

  const handleUpdate = (month: string, assetId: string, value: string) => {
    setMonthUpdates((prev) => ({
      ...prev,
      [month]: {
        ...prev[month],
        [assetId]: value,
      },
    }));
  };

  const handleSaveAll = () => {
    const allUpdates: SnapshotUpdate[] = [];

    for (let month = 0; month < 12; month++) {
      const monthKey = month.toString();
      const updates = monthUpdates[monthKey] || {};
      const date = monthDates[monthKey];

      assets
        .filter((asset) => updates[asset.id])
        .forEach((asset) => {
          const value = parseCurrencyValue(updates[asset.id]);
          if (value > 0) {
            allUpdates.push({
              assetId: asset.id,
              value,
              date,
            });
          }
        });
    }

    if (allUpdates.length === 0) {
      toast({
        title: "Nenhum dado para atualizar",
        description: "Insira valores maiores que zero em pelo menos um mês.",
        variant: "destructive",
      });
      return;
    }

    bulkUpdateMutation.mutate(allUpdates);
  };

  const handlePreviousMonth = () => {
    const current = parseInt(selectedMonth);
    setSelectedMonth(((current - 1 + 12) % 12).toString());
  };

  const handleNextMonth = () => {
    const current = parseInt(selectedMonth);
    setSelectedMonth(((current + 1) % 12).toString());
  };

  const currentMonthUpdates = monthUpdates[selectedMonth] || {};
  const currentMonthDate = monthDates[selectedMonth] || "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Registrar Snapshots Mensais
          </DialogTitle>
          <DialogDescription>
            Atualize o valor de todos os seus investimentos para cada mês. Visualize a evolução do seu patrimônio.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handlePreviousMonth}
              data-testid="button-previous-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex-1 text-center">
              <h3 className="text-lg font-semibold">
                {monthNames[parseInt(selectedMonth)]}
              </h3>
            </div>
            
            <Button
              variant="outline"
              size="icon"
              onClick={handleNextMonth}
              data-testid="button-next-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Date Input */}
          <div className="grid gap-2">
            <Label htmlFor={`month-date-${selectedMonth}`}>
              Data de Atualização - {monthNames[parseInt(selectedMonth)]}
            </Label>
            <Input
              id={`month-date-${selectedMonth}`}
              type="date"
              value={currentMonthDate}
              onChange={(e) => handleMonthDateChange(selectedMonth, e.target.value)}
              data-testid={`input-month-date-${selectedMonth}`}
            />
          </div>

          {/* Assets List */}
          <div className="grid gap-2 flex-1 overflow-hidden flex flex-col">
            <Label>Investimentos ({assets.length})</Label>
            {assetsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : assets.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">Nenhum investimento cadastrado.</p>
            ) : (
              <ScrollArea className="flex-1 pr-4">
                <div className="space-y-3">
                  {assets.map((asset) => (
                    <Card key={asset.id} className="border">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{asset.name}</p>
                            <p className="text-xs text-muted-foreground">{asset.symbol}</p>
                          </div>
                          <Input
                            value={currentMonthUpdates[asset.id] || ""}
                            onChange={(e) => 
                              handleUpdate(selectedMonth, asset.id, formatCurrencyDisplay(e.target.value))
                            }
                            placeholder="R$ 0,00"
                            className="w-40 text-right text-sm"
                            data-testid={`input-snapshot-${selectedMonth}-${asset.id}`}
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
            data-testid="button-save-all-snapshots"
          >
            {bulkUpdateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : null}
            Salvar Todos os Meses
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
