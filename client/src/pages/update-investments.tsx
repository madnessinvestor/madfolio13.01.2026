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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [monthUpdateDates, setMonthUpdateDates] = useState<Record<string, string>>({});
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
            <Tabs defaultValue="investments" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="investments" data-testid="tab-investments">Investimentos</TabsTrigger>
                <TabsTrigger value="results" data-testid="tab-results">Resultados</TabsTrigger>
              </TabsList>

              <TabsContent value="investments" className="space-y-4">
                {Array.from({ length: 12 }).map((_, monthIdx) => (
                  <Card key={monthIdx} className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold">{monthShortNames[monthIdx]}</h3>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm text-muted-foreground">Data de atualização:</Label>
                        <Input
                          type="date"
                          value={monthDates[monthIdx] || ""}
                          onChange={(e) => {
                            setMonthDates((prev) => ({
                              ...prev,
                              [monthIdx]: e.target.value,
                            }));
                          }}
                          className="w-48"
                          data-testid={`input-month-date-${monthIdx}`}
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ativo</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                            <TableHead className="text-right">Variação</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {assets.map((asset) => {
                            const cellKey = `${asset.id}-${monthIdx}`;
                            const isSaving = savingCells.has(cellKey);
                            const currentValue = getMonthValue(asset.id, monthIdx);
                            const previousValue = monthIdx > 0 ? getMonthValue(asset.id, monthIdx - 1) : 0;
                            const evolution = monthIdx > 0 ? calculateEvolution(currentValue, previousValue) : null;

                            return (
                              <TableRow key={asset.id} data-testid={`row-asset-${asset.id}`}>
                                <TableCell className="font-medium">
                                  <div>
                                    <p className="font-semibold">{asset.symbol}</p>
                                    <p className="text-xs text-muted-foreground">{asset.name}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right">
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
                                </TableCell>
                                <TableCell className="text-right">
                                  {evolution && (
                                    <div className="space-y-1">
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
                                        {evolution.value === 0 && <span>0%</span>}
                                      </div>
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
                                    </div>
                                  )}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="results" className="space-y-4">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mês</TableHead>
                        <TableHead className="text-right">Valor Total do Portfólio</TableHead>
                        <TableHead className="text-right">Variação R$</TableHead>
                        <TableHead className="text-right">Variação %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.from({ length: 12 }).map((_, monthIdx) => {
                        const currentTotal = getMonthTotalValue(monthIdx);
                        const previousTotal = monthIdx > 0 ? getMonthTotalValue(monthIdx - 1) : currentTotal;
                        const evolution = calculateEvolution(currentTotal, previousTotal);

                        return (
                          <TableRow key={monthIdx}>
                            <TableCell className="font-semibold">{monthShortNames[monthIdx]}</TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrencyDisplay(currentTotal)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div
                                className={`text-sm font-semibold ${
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
                            </TableCell>
                            <TableCell className="text-right">
                              <div
                                className={`text-sm font-semibold flex items-center justify-end gap-1 ${
                                  evolution.value > 0
                                    ? "text-green-600 dark:text-green-400"
                                    : evolution.value < 0
                                      ? "text-red-600 dark:text-red-400"
                                      : "text-muted-foreground"
                                }`}
                              >
                                {evolution.value > 0 && <TrendingUp className="w-4 h-4" />}
                                {evolution.value < 0 && <TrendingDown className="w-4 h-4" />}
                                {evolution.percentage > 0 ? "+" : ""}
                                {evolution.percentage.toFixed(2)}%
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
