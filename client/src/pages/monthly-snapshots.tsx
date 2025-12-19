import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Calendar, Loader2, TrendingUp, TrendingDown, Save, Lock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
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
  isLocked: number;
}

const monthShortNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function MonthlySnapshotsPage() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  // Initialize year from localStorage, fallback to current year
  const [selectedYear, setSelectedYear] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("investmentEvolution_selectedYear");
      return saved || currentYear.toString();
    }
    return currentYear.toString();
  });

  // Persist year selection to localStorage
  useEffect(() => {
    localStorage.setItem("investmentEvolution_selectedYear", selectedYear);
  }, [selectedYear]);

  const [monthDates, setMonthDates] = useState<Record<string, string>>({});
  const [monthUpdates, setMonthUpdates] = useState<Record<string, Record<string, string>>>({});
  const [monthUpdateDates, setMonthUpdateDates] = useState<Record<string, string>>({});
  const [monthLockedStatus, setMonthLockedStatus] = useState<Record<number, boolean>>({});
  const [savingMonths, setSavingMonths] = useState<Set<number>>(new Set());
  const originalDataRef = useRef<Record<string, Record<string, string>>>({});

  // Initialize useEffect for year persistence (this ensures it runs client-side only)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const getMonthSequence = () => {
    const year = parseInt(selectedYear);
    const sequence = [];
    
    if (year === 2025) {
      for (let i = 11; i < 12; i++) {
        sequence.push(i);
      }
    } else {
      for (let i = 0; i < 12; i++) {
        sequence.push(i);
      }
    }
    return sequence;
  };

  // Memoized chart data calculation to prevent infinite loops
  const chartData = useMemo(() => {
    const data: Array<{ month: string; value: number }> = [];
    
    // Start from December 2025 (month 11)
    let currentDate = new Date(2025, 11, 31); // December 31, 2025
    
    while (currentDate <= new Date()) {
      const month = currentDate.getMonth();
      const year = currentDate.getFullYear();
      
      // Only add to chart if month is registered (locked)
      if (monthLockedStatus[month] === true) {
        const monthTotal = getMonthTotalValue(month);
        data.push({
          month: `${monthShortNames[month]} ${year}`,
          value: monthTotal,
        });
      }
      
      // Move to next month
      currentDate = new Date(year, month + 2, 0);
    }
    
    return data;
  }, [monthLockedStatus, monthUpdates]);

  const monthSequence = getMonthSequence();

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const { data: yearSnapshots = {} } = useQuery<Record<string, Record<number, SnapshotData>>>({
    queryKey: ["/api/snapshots/year", selectedYear],
  });

  const { data: monthStatus = {} } = useQuery<Record<number, boolean>>({
    queryKey: ["/api/snapshots/month-status", selectedYear],
  });

  useEffect(() => {
    setMonthLockedStatus(monthStatus);
  }, [monthStatus]);

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
      originalDataRef.current = JSON.parse(JSON.stringify(newMonthUpdates));
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

  const lockMonthMutation = useMutation({
    mutationFn: async ({ year, month, locked }: { year: number; month: number; locked: boolean }) => {
      return apiRequest("PATCH", "/api/snapshots/month/lock", { year, month, locked });
    },
    onSuccess: (_, { year, month, locked }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots/month-status", year.toString()] });
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots/year", year.toString()] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      
      toast({
        title: locked ? "Mês bloqueado" : "Mês desbloqueado",
        description: locked ? `${monthShortNames[month]} ${year} está bloqueado` : `${monthShortNames[month]} ${year} foi desbloqueado`,
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao bloquear/desbloquear mês",
        variant: "destructive",
      });
    },
  });

  const handleValueChange = (assetId: string, month: string, value: string) => {
    const monthNum = parseInt(month);
    if (monthLockedStatus[monthNum]) return;

    setMonthUpdates((prev) => {
      const newUpdates = {
        ...prev,
        [month]: {
          ...prev[month],
          [assetId]: value,
        },
      };
      return newUpdates;
    });
  };

  const handleSaveMonth = async (month: number) => {
    setSavingMonths((prev) => new Set(prev).add(month));

    try {
      const monthData = monthUpdates[month];
      const updates: SnapshotUpdate[] = [];
      let monthTotal = 0;

      for (const assetId of Object.keys(monthData)) {
        const value = parseCurrencyValue(monthData[assetId]);
        monthTotal += value;
        if (value > 0 && monthDates[month]) {
          updates.push({
            assetId,
            value,
            date: monthDates[month],
          });
        }
      }

      if (updates.length === 0) {
        toast({
          title: "Aviso",
          description: "Nenhum valor foi informado para este mês",
          variant: "destructive",
        });
        return;
      }

      // Save all snapshots
      for (const update of updates) {
        await apiRequest("POST", "/api/snapshots", update);
      }

      const year = parseInt(selectedYear);
      
      // Save monthly portfolio total to portfolio history
      if (monthTotal > 0 && monthDates[month]) {
        await apiRequest("POST", "/api/portfolio/history", {
          totalValue: monthTotal,
          month: month + 1,
          year,
          date: monthDates[month],
        });
      }
      
      // Lock the month after all snapshots are saved
      await new Promise((resolve, reject) => {
        lockMonthMutation.mutate(
          { year, month: month + 1, locked: true },
          {
            onSuccess: () => resolve(true),
            onError: () => reject(new Error("Falha ao bloquear mês")),
          }
        );
      });

      // Show success message
      toast({
        title: "Sucesso",
        description: `${monthShortNames[month]} ${year} foi salvo e bloqueado`,
      });
    } catch (error) {
      console.error("Error saving month:", error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao salvar mês",
        variant: "destructive",
      });
    } finally {
      setSavingMonths((prev) => {
        const newSet = new Set(prev);
        newSet.delete(month);
        return newSet;
      });
    }
  };

  const handleEditMonth = async (month: number) => {
    setSavingMonths((prev) => new Set(prev).add(month));

    try {
      const year = parseInt(selectedYear);
      lockMonthMutation.mutate({ year, month: month + 1, locked: false });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Falha ao desbloquear mês para edição",
        variant: "destructive",
      });
    } finally {
      setSavingMonths((prev) => {
        const newSet = new Set(prev);
        newSet.delete(month);
        return newSet;
      });
    }
  };

  const formatDateBR = (dateStr: string): string => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const years = Array.from({ length: 5 }, (_, i) => (2025 + i).toString());

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Evolução do Portfólio</h1>
        <p className="text-secondary mt-2">Atualize valores por mês. Clique em "Salvar" para bloquear o mês no gráfico</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Evolução do Patrimônio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {assetsLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Registre meses na tabela abaixo para visualizar o gráfico
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number) => [`R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, "Patrimônio"]}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--primary))" 
                  dot={{ fill: "hsl(var(--primary))", r: 5 }}
                  activeDot={{ r: 7 }}
                  name="Patrimônio Total"
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

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
              <div className="border rounded-lg overflow-hidden flex flex-col">
                <div className="overflow-x-auto overflow-y-visible scrollbar-visible" style={{ scrollBehavior: "smooth" }}>
                  <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-background">
                    <th className="sticky left-0 z-20 bg-background border-r px-4 py-3 text-left font-semibold min-w-40">
                      Investimento
                    </th>
                    {monthSequence.map((actualMonth, displayIdx) => (
                      <th key={displayIdx} className="border-r px-2 py-2 text-center font-semibold min-w-32">
                        <div className="text-xs font-medium">{monthShortNames[actualMonth]}</div>
                        <div className="text-xs text-muted-foreground font-normal">
                          {monthLockedStatus[actualMonth] ? "Registrado" : "Data"}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Date input row */}
                  <tr className="border-b bg-muted/20">
                    <td className="sticky left-0 z-10 bg-muted/20 border-r px-4 py-2 text-xs font-medium">Data</td>
                    {monthSequence.map((actualMonth, displayIdx) => (
                      <td key={displayIdx} className="border-r px-2 py-2">
                        {monthLockedStatus[actualMonth] ? (
                          <div className="flex items-center justify-center gap-1 text-xs text-green-600 dark:text-green-400">
                            <Lock className="w-3 h-3" />
                            <span>Registrado</span>
                          </div>
                        ) : (
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
                        )}
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
                        const isMonthLocked = monthLockedStatus[actualMonth];
                        return (
                          <td key={displayIdx} className="border-r px-2 py-2">
                            <input
                              type="text"
                              value={monthUpdates[actualMonth]?.[asset.id] || ""}
                              onChange={(e) =>
                                handleValueChange(asset.id, actualMonth.toString(), e.target.value)
                              }
                              placeholder="0,00"
                              disabled={isMonthLocked}
                              className={`w-full px-2 py-1 text-xs border rounded text-right transition-colors ${
                                isMonthLocked 
                                  ? "bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 opacity-60 cursor-not-allowed border-gray-200 dark:border-gray-700" 
                                  : "bg-background"
                              }`}
                              data-testid={`input-value-${asset.id}-${actualMonth}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}

                  {/* Total row */}
                  <tr className="bg-muted/50 border-t-2 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted/50 border-r px-4 py-3 text-sm">
                      Total do Mês
                    </td>
                    {monthSequence.map((actualMonth, displayIdx) => {
                      const currentTotal = getMonthTotalValue(actualMonth);
                      const previousTotal = displayIdx > 0 ? getMonthTotalValue(monthSequence[displayIdx - 1]) : currentTotal;
                      const evolution = calculateEvolution(currentTotal, previousTotal);
                      const isMonthLocked = monthLockedStatus[actualMonth];

                      return (
                        <td key={displayIdx} className="border-r px-2 py-2">
                          <div className="text-center">
                            <div className={`text-sm font-semibold transition-colors ${
                              isMonthLocked ? "text-gray-400 dark:text-gray-500" : ""
                            }`}>
                              {formatCurrencyDisplay(currentTotal)}
                            </div>
                            {displayIdx > 0 && (
                              <>
                                <div
                                  className={`text-xs font-medium transition-colors ${
                                    isMonthLocked 
                                      ? "text-gray-400 dark:text-gray-500"
                                      : evolution.value > 0
                                      ? "text-green-600 dark:text-green-400"
                                      : evolution.value < 0
                                        ? "text-red-600 dark:text-red-400"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  {evolution.value > 0 ? "+" : ""}{formatCurrencyDisplay(evolution.value)}
                                </div>
                                <div
                                  className={`text-xs font-medium transition-colors ${
                                    isMonthLocked
                                      ? "text-gray-400 dark:text-gray-500"
                                      : evolution.value > 0
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

                  {/* Button row - Save/Edit buttons for each month */}
                  <tr className="border-b bg-background">
                    <td className="sticky left-0 z-10 bg-background border-r px-4 py-3" />
                    {monthSequence.map((actualMonth, displayIdx) => {
                      const isMonthLocked = monthLockedStatus[actualMonth];
                      return (
                        <td key={displayIdx} className="border-r px-2 py-3">
                          {!isMonthLocked ? (
                            <Button
                              onClick={() => handleSaveMonth(actualMonth)}
                              disabled={savingMonths.has(actualMonth)}
                              size="sm"
                              className="w-full gap-1 bg-green-600 hover:bg-green-700 text-white"
                              data-testid={`button-save-month-${actualMonth}`}
                            >
                              {savingMonths.has(actualMonth) ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                  Salvando
                                </>
                              ) : (
                                <>
                                  <Save className="w-3 h-3" />
                                  Salvar
                                </>
                              )}
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleEditMonth(actualMonth)}
                              disabled={savingMonths.has(actualMonth)}
                              size="sm"
                              className="w-full gap-1 bg-red-600 hover:bg-red-700 text-white"
                              data-testid={`button-edit-month-${actualMonth}`}
                            >
                              {savingMonths.has(actualMonth) ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                </>
                              ) : (
                                <>
                                  <Lock className="w-3 h-3" />
                                  Editar
                                </>
                              )}
                            </Button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </tbody>
                  </table>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                💡 Dica: Clique em "Salvar" (verde) abaixo de cada mês para bloquear. Valores bloqueados aparecem em cinza e no gráfico. Clique em "Editar" (vermelho) para desbloquear.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
