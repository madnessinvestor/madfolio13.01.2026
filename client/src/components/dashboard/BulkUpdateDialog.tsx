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
          // Se tem snapshot, usa o valor do snapshot. Senão, calcula quantity × currentPrice
          const value = monthData?.value || ((asset.quantity || 0) * (asset.currentPrice || 0)) || 0;
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
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots/year"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
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

  const handleMonthDateChange = (month: string, date: string) => {
    setMonthDates((prev) => ({
      ...prev,
      [month]: date,
    }));
  };

  const years = Array.from({ length: 10 }, (_, i) => currentYear - 5 + i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full h-[90vh] flex flex-col p-0">
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
            <ScrollArea className="flex-1 border rounded-lg">
              <div className="inline-block min-w-full">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold min-w-[200px] border-r sticky left-0 bg-background">
                        Investimento
                      </th>
                      {monthNames.map((_, idx) => {
                        const monthKey = idx.toString();
                        const date = monthDates[monthKey] || "";
                        const formattedDate = date ? new Date(date + "T00:00:00").toLocaleDateString("pt-BR") : "-";
                        
                        // Calculate month total
                        const monthTotal = Object.keys(monthUpdates[monthKey] || {}).reduce((sum, assetId) => {
                          const value = monthUpdates[monthKey]?.[assetId] || "0";
                          return sum + parseCurrencyValue(value);
                        }, 0);
                        
                        // Calculate variation from previous month
                        const prevMonthKey = (idx - 1).toString();
                        const prevMonthTotal = idx > 0 ? Object.keys(monthUpdates[prevMonthKey] || {}).reduce((sum, assetId) => {
                          const value = monthUpdates[prevMonthKey]?.[assetId] || "0";
                          return sum + parseCurrencyValue(value);
                        }, 0) : 0;
                        
                        const variation = monthTotal - prevMonthTotal;
                        const variationPercent = prevMonthTotal > 0 ? ((variation / prevMonthTotal) * 100).toFixed(2).replace('.', ',') : "0,00";
                        
                        const formatCurrencyValue = (val: number) =>
                          `R$ ${val.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                        
                        return (
                          <th key={idx} className="px-2 py-2 text-center font-semibold min-w-[110px] border-r">
                            <div className="text-xs font-medium mb-1">{monthShortNames[idx]}</div>
                            <div className="text-xs font-semibold mt-2 text-foreground">{formatCurrencyValue(monthTotal)}</div>
                            {idx > 0 && (
                              <>
                                <div className={`text-xs mt-1 ${variation >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {variation >= 0 ? '+' : ''}{formatCurrencyValue(variation)}
                                </div>
                                <div className={`text-xs ${variation >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                  {variation >= 0 ? '+' : ''}{variationPercent}%
                                </div>
                              </>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((asset) => (
                      <tr key={asset.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-3 font-medium min-w-[200px] border-r sticky left-0 bg-background hover:bg-muted/50">
                          <div className="text-sm font-semibold">{asset.name}</div>
                          <div className="text-xs text-muted-foreground">{asset.symbol}</div>
                        </td>
                        {Array.from({ length: 12 }).map((_, monthIdx) => {
                          const monthKey = monthIdx.toString();
                          const cellKey = `${monthKey}-${asset.id}`;
                          const value = monthUpdates[monthKey]?.[asset.id] || "";
                          const isSaving = savingCells.has(cellKey);
                          
                          return (
                            <td key={monthIdx} className="px-2 py-3 border-r">
                              <div className="relative space-y-2">
                                <Input
                                  value={value}
                                  onChange={(e) => handleUpdate(monthKey, asset.id, e.target.value)}
                                  placeholder="R$ 0,00"
                                  className="text-right text-sm w-full"
                                  data-testid={`input-snapshot-${monthKey}-${asset.id}`}
                                />
                                <div className="space-y-1">
                                  <Label className="text-[10px] text-muted-foreground">Data:</Label>
                                  <Input
                                    type="date"
                                    value={monthDates[monthKey] || ""}
                                    onChange={(e) => handleMonthDateChange(monthKey, e.target.value)}
                                    className="h-7 text-[10px] px-2"
                                  />
                                </div>
                                {isSaving && (
                                  <div className="absolute right-2 top-4 transform -translate-y-1/2">
                                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                                  </div>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
