import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Asset } from "@shared/schema";

interface SnapshotUpdate {
  assetId: string;
  value: number;
  date: string;
}

interface SnapshotData {
  value: number;
  date: string;
  createdAt: string;
}

const monthShortNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function UpdateInvestmentsPage() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [monthDates, setMonthDates] = useState<Record<string, string>>({});
  const [monthUpdates, setMonthUpdates] = useState<Record<string, Record<string, string>>>({});
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const { data: yearSnapshots = {} } = useQuery<Record<string, Record<number, SnapshotData>>>({
    queryKey: ["/api/snapshots/year", selectedYear],
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
          const value = monthData?.value || ((asset.quantity || 0) * (asset.currentPrice || 0)) || 0;
          newMonthUpdates[monthKey][asset.id] = formatCurrencyInput(value);
        });
      }

      setMonthDates(newMonthDates);
      setMonthUpdates(newMonthUpdates);
    }
  }, [assets, selectedYear, yearSnapshots]);

  const formatCurrencyInput = (value: number): string => {
    return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatCurrencyDisplay = (value: number): string => {
    return `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const parseCurrencyValue = (val: string): number => {
    const num = val.replace(/[^\d.,]/g, "");
    return parseFloat(num.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const calculateEvolution = (currentValue: number, previousValue: number) => {
    if (previousValue === 0) return { percentage: 0, value: 0 };
    const valueDiff = currentValue - previousValue;
    const percentageDiff = (valueDiff / previousValue) * 100;
    return { percentage: percentageDiff, value: valueDiff };
  };

  const getMonthValue = (assetId: string, month: number): number => {
    return parseCurrencyValue(monthUpdates[month]?.[assetId] || "0");
  };

  const getLastUpdateDate = (assetId: string): string => {
    // Find the most recent snapshot for this asset in the selected year
    for (let month = 11; month >= 0; month--) {
      const monthData = yearSnapshots[assetId]?.[month];
      if (monthData?.createdAt) {
        return new Date(monthData.createdAt).toLocaleDateString("pt-BR");
      }
    }
    const asset = assets.find((a) => a.id === assetId);
    if (asset?.lastPriceUpdate) {
      return new Date(asset.lastPriceUpdate).toLocaleDateString("pt-BR");
    }
    return "Não atualizado";
  };

  const updateSnapshotMutation = useMutation({
    mutationFn: async (update: SnapshotUpdate) => {
      return apiRequest("POST", "/api/snapshots", update);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao atualizar valor",
        variant: "destructive",
      });
    },
  });

  const handleValueChange = (assetId: string, month: string, value: string) => {
    setMonthUpdates((prev) => ({
      ...prev,
      [month]: {
        ...prev[month],
        [assetId]: value,
      },
    }));

    const cellKey = `${assetId}-${month}`;
    if (debounceTimerRef.current[cellKey]) {
      clearTimeout(debounceTimerRef.current[cellKey]);
    }

    debounceTimerRef.current[cellKey] = setTimeout(() => {
      setSavingCells((prev) => new Set(prev).add(cellKey));

      const numValue = parseCurrencyValue(value);
      if (numValue > 0 && monthDates[month]) {
        updateSnapshotMutation.mutate({
          assetId,
          value: numValue,
          date: monthDates[month],
        });
      }

      setTimeout(() => {
        setSavingCells((prev) => {
          const newSet = new Set(prev);
          newSet.delete(cellKey);
          return newSet;
        });
      }, 500);
    }, 500);
  };

  const years = Array.from({ length: 5 }, (_, i) => (currentYear - 4 + i).toString());

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Atualizar Investimentos</h1>
        <p className="text-secondary mt-2">Atualize valores por mês e acompanhe a evolução do seu patrimônio</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Valores por Mês - {selectedYear}
            </CardTitle>
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-40" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {assetsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Adicione investimentos para começar a atualizar valores
            </div>
          ) : (
            <>
              <div className="overflow-x-auto mb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Ativo</TableHead>
                      <TableHead className="min-w-[120px]">Última Atualização</TableHead>
                      {monthShortNames.map((month, idx) => (
                        <TableHead key={`${month}-${idx}`} className="text-right min-w-[140px]">
                          <div className="flex flex-col items-end gap-1">
                            <span>{month}</span>
                            {idx > 0 && (
                              <span className="text-xs text-muted-foreground">Evolução</span>
                            )}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assets.map((asset) => (
                      <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`}>
                        <TableCell className="font-medium">
                          <div>
                            <p className="font-semibold">{asset.symbol}</p>
                            <p className="text-xs text-muted-foreground">{asset.name}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {getLastUpdateDate(asset.id)}
                        </TableCell>
                        {Array.from({ length: 12 }).map((_, monthIdx) => {
                          const cellKey = `${asset.id}-${monthIdx}`;
                          const isSaving = savingCells.has(cellKey);
                          const currentValue = getMonthValue(asset.id, monthIdx);
                          const previousValue = monthIdx > 0 ? getMonthValue(asset.id, monthIdx - 1) : 0;
                          const evolution = monthIdx > 0 ? calculateEvolution(currentValue, previousValue) : null;

                          return (
                            <TableCell key={monthIdx} className="text-right align-top">
                              <div className="flex flex-col gap-2">
                                <Input
                                  type="text"
                                  value={monthUpdates[monthIdx]?.[asset.id] || ""}
                                  onChange={(e) =>
                                    handleValueChange(asset.id, monthIdx.toString(), e.target.value)
                                  }
                                  placeholder="R$ 0,00"
                                  className={`text-right text-sm h-8 ${
                                    isSaving ? "bg-blue-50 dark:bg-blue-950/30" : ""
                                  }`}
                                  data-testid={`input-value-${asset.id}-${monthIdx}`}
                                />
                                {evolution && (
                                  <div
                                    className={`text-xs font-semibold flex items-center justify-end gap-1 ${
                                      evolution.value > 0
                                        ? "text-green-600 dark:text-green-400"
                                        : evolution.value < 0
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-muted-foreground"
                                    }`}
                                  >
                                    {evolution.value > 0 && (
                                      <>
                                        <TrendingUp className="w-3 h-3" />
                                        +{evolution.percentage.toFixed(1)}%
                                      </>
                                    )}
                                    {evolution.value < 0 && (
                                      <>
                                        <TrendingDown className="w-3 h-3" />
                                        {evolution.percentage.toFixed(1)}%
                                      </>
                                    )}
                                    {evolution.value === 0 && (
                                      <span className="text-xs">0%</span>
                                    )}
                                  </div>
                                )}
                                {evolution && (
                                  <div
                                    className={`text-xs ${
                                      evolution.value > 0
                                        ? "text-green-600 dark:text-green-400"
                                        : evolution.value < 0
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-muted-foreground"
                                    }`}
                                  >
                                    {evolution.value > 0 ? "+" : ""}
                                    {formatCurrencyDisplay(evolution.value)}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-950/30 rounded-md border border-slate-200 dark:border-slate-800">
                <p className="text-sm text-secondary mb-2">
                  💡 <strong>Como usar:</strong>
                </p>
                <ul className="text-sm text-secondary space-y-1">
                  <li>• Clique em qualquer célula e digite o valor em R$ para atualizar</li>
                  <li>• A evolução mostra a mudança percentual e em valor do mês anterior</li>
                  <li>• As mudanças são salvas automaticamente</li>
                  <li>• Verde = aumento, Vermelho = queda</li>
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
