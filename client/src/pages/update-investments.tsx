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
  const currentMonth = new Date().getMonth();
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  const [selectedYear, setSelectedYear] = useState(currentYear.toString());
  const [monthDates, setMonthDates] = useState<Record<string, string>>({});
  const [monthUpdates, setMonthUpdates] = useState<Record<string, Record<string, string>>>({});
  const [monthUpdateDates, setMonthUpdateDates] = useState<Record<string, string>>({});
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  // Generate month sequence starting from current month
  const getMonthSequence = () => {
    const sequence = [];
    for (let i = 0; i < 12; i++) {
      sequence.push((currentMonth + i) % 12);
    }
    return sequence;
  };

  const monthSequence = getMonthSequence();

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
      const newMonthUpdateDates: Record<string, string> = {};

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

        // Get the most recent update date for this month across all assets
        let latestDate = "";
        for (const asset of assets) {
          const monthData = yearSnapshots[asset.id]?.[month];
          if (monthData?.createdAt) {
            const date = new Date(monthData.createdAt);
            if (!latestDate || date > new Date(latestDate)) {
              latestDate = monthData.createdAt;
            }
          }
        }
        newMonthUpdateDates[monthKey] = latestDate ? new Date(latestDate).toLocaleDateString("pt-BR") : "";
      }

      setMonthDates(newMonthDates);
      setMonthUpdates(newMonthUpdates);
      setMonthUpdateDates(newMonthUpdateDates);
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

  const getMonthTotalValue = (month: number): number => {
    let total = 0;
    for (const asset of assets) {
      total += getMonthValue(asset.id, month);
    }
    return total;
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

  const formatDateBR = (dateStr: string): string => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const years = Array.from({ length: 5 }, (_, i) => (currentYear - 4 + i).toString());

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Atualizar Investimentos</h1>
        <p className="text-secondary mt-2">Atualize valores por mês e acompanhe a evolução do seu portfólio</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Investimentos - {selectedYear}
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
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden flex flex-col max-h-[75vh]">
                <div className="overflow-x-auto overflow-y-auto">
                  <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-background">
                    <th className="sticky left-0 z-20 bg-background border-r px-4 py-3 text-left font-semibold min-w-40">
                      Investimento
                    </th>
                    {monthSequence.map((actualMonth, displayIdx) => (
                      <th key={displayIdx} className="border-r px-2 py-2 text-center font-semibold min-w-28">
                        <div className="text-xs font-medium">{monthShortNames[actualMonth]}</div>
                        <div className="text-xs text-muted-foreground font-normal">Data da Amortização</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Date input row */}
                  <tr className="border-b bg-muted/20">
                    <td className="sticky left-0 z-10 bg-muted/20 border-r px-4 py-2"></td>
                    {monthSequence.map((actualMonth, displayIdx) => (
                      <td key={displayIdx} className="border-r px-2 py-2">
                        <input
                          type="date"
                          value={monthDates[actualMonth] || ""}
                          onChange={(e) => {
                            setMonthDates((prev) => ({
                              ...prev,
                              [actualMonth]: e.target.value,
                            }));
                          }}
                          className="w-full px-2 py-1 text-xs border rounded bg-background"
                          data-testid={`input-month-date-${actualMonth}`}
                        />
                      </td>
                    ))}
                  </tr>

                  {/* Asset rows */}
                  {assets.map((asset) => (
                    <tr key={asset.id} className="border-b hover:bg-muted/50">
                      <td className="sticky left-0 z-10 bg-background hover:bg-muted/50 border-r px-4 py-3">
                        <p className="font-semibold text-sm">{asset.symbol}</p>
                        <p className="text-xs text-muted-foreground">{asset.name}</p>
                      </td>
                      {monthSequence.map((actualMonth, displayIdx) => {
                        const cellKey = `${asset.id}-${actualMonth}`;
                        const isSaving = savingCells.has(cellKey);
                        return (
                          <td key={displayIdx} className="border-r px-2 py-2">
                            <div className="relative">
                              <input
                                type="text"
                                value={monthUpdates[actualMonth]?.[asset.id] || ""}
                                onChange={(e) =>
                                  handleValueChange(asset.id, actualMonth.toString(), e.target.value)
                                }
                                placeholder="0,00"
                                className={`w-full px-2 py-1 text-xs border rounded text-right bg-background transition-colors ${
                                  isSaving ? "bg-blue-50 dark:bg-blue-950/30 border-blue-300" : ""
                                }`}
                                data-testid={`input-value-${asset.id}-${actualMonth}`}
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
                    <td className="sticky left-0 z-10 bg-muted/50 border-r px-4 py-3 text-sm">
                      Soma dos Investimentos
                    </td>
                    {monthSequence.map((actualMonth, displayIdx) => {
                      const currentTotal = getMonthTotalValue(actualMonth);
                      const previousTotal = displayIdx > 0 ? getMonthTotalValue(monthSequence[displayIdx - 1]) : currentTotal;
                      const evolution = calculateEvolution(currentTotal, previousTotal);

                      return (
                        <td key={displayIdx} className="border-r px-2 py-2">
                          <div className="space-y-1 text-center">
                            <div className="text-sm font-semibold">
                              {formatCurrencyDisplay(currentTotal)}
                            </div>
                            {displayIdx > 0 && (
                              <>
                                <div
                                  className={`text-xs font-medium ${
                                    evolution.value > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : evolution.value < 0
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {evolution.value > 0 ? "+" : ""}{formatCurrencyDisplay(evolution.value)}
                                </div>
                                <div
                                  className={`text-xs font-medium ${
                                    evolution.value > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : evolution.value < 0
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {evolution.percentage > 0 ? "+" : ""}{evolution.percentage.toFixed(2)}%
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
              </div>
              <div className="text-xs text-muted-foreground">
                💡 Dica: Use as barras de rolagem para ver todos os meses e investimentos
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
