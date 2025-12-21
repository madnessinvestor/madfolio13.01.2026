import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Asset {
  id: string;
  symbol: string;
  name: string;
  market: string;
  quantity: number;
  currentPrice: number | null;
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

const monthShortNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export function BulkUpdateDialog({ open, onOpenChange }: BulkUpdateDialogProps) {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});
  
  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [monthDates, setMonthDates] = useState<Record<string, string>>({});
  const [monthUpdates, setMonthUpdates] = useState<Record<string, Record<string, string>>>({});
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
    enabled: open,
  });

  const { data: yearSnapshots = {} } = useQuery<Record<string, Record<number, { value: number; date: string }>>>({
    queryKey: ["/api/snapshots/year", selectedYear],
    enabled: open,
  });

  useEffect(() => {
    if (assets.length > 0) {
      const year = parseInt(selectedYear);
      const newMonthDates: Record<string, string> = {};
      const newMonthUpdates: Record<string, Record<string, string>> = {};
      
      for (let month = 0; month < 12; month++) {
        const monthKey = month.toString();
        const lastDayOfMonth = new Date(year, month + 1, 0);
        newMonthDates[monthKey] = lastDayOfMonth.toISOString().split("T")[0];
        
        newMonthUpdates[monthKey] = {};
        assets.forEach((asset) => {
          const monthData = yearSnapshots[asset.id]?.[month];
          // Se tem snapshot, usa o valor do snapshot. Senão, calcula quantity × (currentPrice ou acquisitionPrice)
          const priceToUse = asset.currentPrice || asset.acquisitionPrice || 0;
          const value = monthData?.value || ((asset.quantity || 0) * priceToUse) || 0;
          newMonthUpdates[monthKey][asset.id] = formatCurrencyInput(value);
        });
      }
      
      setMonthDates(newMonthDates);
      setMonthUpdates(newMonthUpdates);
    }
  }, [assets, open, selectedYear]);

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
    return formatted;
  };

  const parseCurrencyValue = (val: string): number => {
    const num = val.replace(/[^\d.,]/g, "");
    return parseFloat(num.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const calculateMonthTotal = (monthKey: string) => {
    return Object.keys(monthUpdates[monthKey] || {}).reduce((sum, assetId) => {
      const value = monthUpdates[monthKey]?.[assetId] || "0";
      return sum + parseCurrencyValue(value);
    }, 0);
  };

  const formatCurrencyValue = (val: number) =>
    `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const updateSnapshotMutation = useMutation({
    mutationFn: async (update: SnapshotUpdate) => {
      return apiRequest("POST", "/api/snapshots", update);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots/year"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots/latest"] });
      queryClient.invalidateQueries({ queryKey: ["/api/statements"], exact: false });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/activities"] });
      toast({
        title: "Valor atualizado",
        description: "O lançamento foi registrado no histórico.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar o valor.",
        variant: "destructive",
      });
    },
  });

  const handleUpdate = (month: string, assetId: string, value: string) => {
    const displayValue = formatCurrencyDisplay(value);
    setMonthUpdates((prev) => ({
      ...prev,
      [month]: {
        ...prev[month],
        [assetId]: displayValue,
      },
    }));
    setHasPendingChanges(true);

    // Debounce the save
    const cellKey = `${month}-${assetId}`;
    if (debounceTimerRef.current[cellKey]) {
      clearTimeout(debounceTimerRef.current[cellKey]);
    }

    setSavingCells((prev) => new Set(prev).add(cellKey));

    debounceTimerRef.current[cellKey] = setTimeout(() => {
      const parsedValue = parseCurrencyValue(displayValue);
      const date = monthDates[month];
      
      if (parsedValue > 0 && date) {
        updateSnapshotMutation.mutate({
          assetId,
          value: parsedValue,
          date,
        });
      }
      
      setSavingCells((prev) => {
        const newSet = new Set(prev);
        newSet.delete(cellKey);
        return newSet;
      });
    }, 800);
  };

  const handleSaveAll = () => {
    setIsSavingAll(true);
    const updates: SnapshotUpdate[] = [];

    Object.keys(monthUpdates).forEach((monthKey) => {
      Object.keys(monthUpdates[monthKey] || {}).forEach((assetId) => {
        const displayValue = monthUpdates[monthKey]?.[assetId] || "0";
        const parsedValue = parseCurrencyValue(displayValue);
        const date = monthDates[monthKey];
        
        if (parsedValue > 0 && date) {
          updates.push({
            assetId,
            value: parsedValue,
            date,
          });
        }
      });
    });

    if (updates.length === 0) {
      toast({
        title: "Nenhuma alteração",
        description: "Não há valores para salvar.",
        variant: "destructive",
      });
      setIsSavingAll(false);
      return;
    }

    // Save all updates in parallel
    const promises = updates.map(update =>
      new Promise<void>((resolve) => {
        updateSnapshotMutation.mutate(update, {
          onSuccess: () => resolve(),
          onError: () => resolve(),
        });
      })
    );

    Promise.all(promises).then(() => {
      setIsSavingAll(false);
      setHasPendingChanges(false);
      toast({
        title: "Salvo com sucesso",
        description: `${updates.length} valor(es) foi(foram) atualizado(s).`,
      });
    });
  };

  const handleMonthDateChange = (month: string, date: string) => {
    setMonthDates((prev) => ({
      ...prev,
      [month]: date,
    }));
  };

  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full flex flex-col p-0" style={{ height: "90vh", maxHeight: "90vh" }}>
        <DialogHeader className="p-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Atualizar Investimentos
          </DialogTitle>
          <DialogDescription>
            Atualize os valores de todos os seus investimentos mês a mês. Os dados são salvos automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col px-6 gap-4">
          {/* Year and Global Date Selectors */}
          <div className="flex items-center gap-8 bg-muted/30 p-4 rounded-lg">
            <div className="flex items-center gap-3">
              <Label htmlFor="year-select" className="font-semibold text-sm">
                Ano:
              </Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[120px] bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          {/* Table */}
          {assetsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : assets.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum investimento cadastrado.</p>
          ) : (
            <ScrollArea className="flex-1 border rounded-lg scrollbar-visible" style={{ maxHeight: "calc(90vh - 300px)" }}>
              <div className="inline-block min-w-full">
                <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr className="border-b bg-background">
                      <th className="sticky left-0 z-20 bg-background border-r px-2 py-1 text-left font-semibold min-w-28">
                        Investimento
                      </th>
                      {monthNames.map((_, idx) => (
                        <th key={idx} className="border-r px-1 py-1 text-center font-semibold min-w-20">
                          <div className="text-xs font-medium">{monthShortNames[idx]}</div>
                          <div className="text-2xs text-muted-foreground font-normal">Atualizar</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Date input row */}
                    <tr className="border-b bg-muted/20">
                      <td className="sticky left-0 z-10 bg-muted/20 border-r px-2 py-1"></td>
                      {monthNames.map((_, idx) => (
                        <td key={idx} className="border-r px-1 py-1">
                          <Input
                            type="date"
                            value={monthDates[idx.toString()] || ""}
                            onChange={(e) => handleMonthDateChange(idx.toString(), e.target.value)}
                            className="w-full px-1 py-0.5 text-2xs border rounded bg-background"
                            data-testid={`input-month-date-${idx}`}
                          />
                        </td>
                      ))}
                    </tr>

                    {/* Asset rows */}
                    {assets.map((asset) => (
                      <tr key={asset.id} className="border-b hover:bg-muted/50">
                        <td className="sticky left-0 z-10 bg-background hover:bg-muted/50 border-r px-2 py-1">
                          <p className="font-semibold text-xs">{asset.symbol}</p>
                          <p className="text-2xs text-muted-foreground">{asset.name}</p>
                        </td>
                        {Array.from({ length: 12 }).map((_, monthIdx) => {
                          const monthKey = monthIdx.toString();
                          const cellKey = `${monthKey}-${asset.id}`;
                          const isSaving = savingCells.has(cellKey);
                          const value = monthUpdates[monthKey]?.[asset.id] || "";
                          
                          return (
                            <td key={monthIdx} className="border-r px-1 py-1">
                              <div className="relative">
                                <Input
                                  type="text"
                                  value={value}
                                  onChange={(e) => handleUpdate(monthKey, asset.id, e.target.value)}
                                  placeholder="0,00"
                                  className={`w-full px-1 py-0.5 text-2xs border rounded text-right bg-background transition-colors ${
                                    isSaving ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300" : ""
                                  }`}
                                  data-testid={`input-snapshot-${monthKey}-${asset.id}`}
                                />
                                {isSaving && (
                                  <Loader2 className="absolute right-2 top-1/2 transform -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr className="bg-muted/50 border-t-2 font-semibold">
                      <td className="sticky left-0 z-10 bg-muted/50 border-r px-2 py-1 text-xs">
                        Soma
                      </td>
                      {monthNames.map((_, idx) => {
                        const monthKey = idx.toString();
                        const currentTotal = Object.keys(monthUpdates[monthKey] || {}).reduce((sum, assetId) => {
                          const value = monthUpdates[monthKey]?.[assetId] || "0";
                          return sum + parseCurrencyValue(value);
                        }, 0);
                        
                        const prevMonthKey = (idx - 1).toString();
                        const prevMonthTotal = idx > 0 ? Object.keys(monthUpdates[prevMonthKey] || {}).reduce((sum, assetId) => {
                          const value = monthUpdates[prevMonthKey]?.[assetId] || "0";
                          return sum + parseCurrencyValue(value);
                        }, 0) : currentTotal;
                        
                        const variation = currentTotal - prevMonthTotal;
                        const variationPercent = prevMonthTotal > 0 ? ((variation / prevMonthTotal) * 100).toFixed(2) : "0.00";
                        
                        const formatCurrencyValue = (val: number) =>
                          `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

                        return (
                          <td key={idx} className="border-r px-1 py-1">
                            <div className="space-y-0 text-center">
                              <div className="text-2xs font-semibold">
                                {formatCurrencyValue(currentTotal)}
                              </div>
                              {idx > 0 && (
                                <>
                                  <div
                                    className={`text-2xs font-medium ${
                                      variation >= 0
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-600 dark:text-red-400"
                                    }`}
                                  >
                                    {variation >= 0 ? "+" : ""}{formatCurrencyValue(variation)}
                                  </div>
                                  <div
                                    className={`text-2xs font-medium ${
                                      variation >= 0
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-600 dark:text-red-400"
                                    }`}
                                  >
                                    {variation >= 0 ? "+" : ""}{variationPercent}%
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-bulk-update"
          >
            Fechar
          </Button>
          <Button
            type="button"
            onClick={handleSaveAll}
            disabled={isSavingAll || savingCells.size > 0}
            data-testid="button-save-bulk-update"
          >
            {isSavingAll ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              "Salvar Alterações"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
