import { MetricCard } from "@/components/dashboard/MetricCard";
import { ExposureCard } from "@/components/dashboard/ExposureCard";
import { PortfolioHoldings } from "@/components/dashboard/PortfolioHoldings";
import { AddInvestmentDialog, type Investment, type Snapshot } from "@/components/dashboard/AddInvestmentDialog";
import { Wallet, TrendingUp, Landmark, BarChart3, Building2, Calendar, Loader2, Save, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { useDisplayCurrency } from "@/hooks/use-currency";
import { useCurrencyConverter } from "@/components/CurrencySwitcher";
import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ComposedChart, Bar } from "recharts";
import type { Asset } from "@shared/schema";

interface PortfolioSummary {
  totalValue: number;
  cryptoValue: number;
  traditionalValue: number;
  fixedIncomeValue: number;
  variableIncomeValue: number;
  realEstateValue: number;
  holdings: Array<{
    id: string;
    symbol: string;
    name: string;
    category: string;
    market: string;
    value: number;
    quantity: number;
    acquisitionPrice: number;
    currentPrice: number;
    profitLoss: number;
    profitLossPercent: number;
  }>;
}

interface HistoryPoint {
  month: string;
  year: number;
  value: number;
  variation: number;
  variationPercent: number;
}

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

export default function Dashboard() {
  const { toast } = useToast();
  const { displayCurrency, isBalanceHidden } = useDisplayCurrency();
  const { formatCurrency } = useCurrencyConverter();
  const [, navigate] = useLocation();
  const debounceTimerRef = useRef<Record<string, NodeJS.Timeout>>({});

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth();

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

  // Initialize useEffect for year persistence
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

  const parseCurrencyValue = (val: string): number => {
    const num = val.replace(/[^\d.,]/g, "");
    return parseFloat(num.replace(/\./g, "").replace(",", ".")) || 0;
  };

  const getMonthValue = (assetId: string, month: number): number => {
    return parseCurrencyValue(monthUpdates[month]?.[assetId] || "0");
  };

  const getMonthTotalValue = (month: number): number => {
    let total = 0;
    const monthData = monthUpdates[month] || {};
    for (const assetId in monthData) {
      total += parseCurrencyValue(monthData[assetId]);
    }
    return total;
  };

  // Memoized chart data calculation - 12 months of selected year
  const chartData = useMemo(() => {
    const data: Array<{ month: string; value: number; locked: boolean; variation?: number; variationPercent?: number }> = [];
    
    // Generate 12 months for the selected year
    for (let month = 0; month < 12; month++) {
      const isLocked = monthLockedStatus[month] === true;
      const monthTotal = getMonthTotalValue(month);
      
      // Calculate variation from previous month
      let variation = undefined;
      let variationPercent = undefined;
      
      if (month > 0) {
        const previousMonthTotal = getMonthTotalValue(month - 1);
        if (previousMonthTotal > 0) {
          variation = monthTotal - previousMonthTotal;
          variationPercent = (variation / previousMonthTotal) * 100;
        }
      }
      
      data.push({
        month: monthShortNames[month],
        value: isLocked ? monthTotal : 0,
        locked: isLocked,
        variation,
        variationPercent,
      });
    }
    
    return data;
  }, [monthLockedStatus, monthUpdates]);

  const monthSequence = getMonthSequence();

  const { data: summary, isLoading: summaryLoading } = useQuery<PortfolioSummary>({
    queryKey: ["/api/portfolio/summary"],
  });

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

  const calculateEvolution = (currentValue: number, previousValue: number) => {
    if (previousValue === 0) return { percentage: 0, value: 0 };
    const valueDiff = currentValue - previousValue;
    const percentageDiff = (valueDiff / previousValue) * 100;
    return { percentage: percentageDiff, value: valueDiff };
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
        description: locked ? `${monthShortNames[month - 1]} ${year} está bloqueado` : `${monthShortNames[month - 1]} ${year} foi desbloqueado`,
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

  const years = Array.from({ length: 6 }, (_, i) => (2025 + i).toString());

  const createInvestmentMutation = useMutation({
    mutationFn: async (investment: Omit<Investment, "id" | "currentPrice">) => {
      return apiRequest("POST", "/api/assets", { ...investment, currency: "BRL" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Investimento adicionado",
        description: "O investimento foi cadastrado e o preço atual será atualizado automaticamente.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível adicionar o investimento.",
        variant: "destructive",
      });
    },
  });

  const createSnapshotMutation = useMutation({
    mutationFn: async (snapshot: Snapshot) => {
      return apiRequest("POST", "/api/snapshots", snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Valor atualizado",
        description: "O valor do ativo foi atualizado com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o valor.",
        variant: "destructive",
      });
    },
  });

  const handleAddInvestment = (investment: Omit<Investment, "id" | "currentPrice">) => {
    createInvestmentMutation.mutate(investment);
  };

  const handleAddSnapshot = (snapshot: Snapshot) => {
    createSnapshotMutation.mutate(snapshot);
  };

  const totalPortfolio = summary?.totalValue || 0;
  
  // Calculate crypto value correctly by summing both holdings and wallets crypto
  const allCryptoAssets = summary?.holdings.filter((h) => h.market === "crypto" || h.market === "crypto_simplified") || [];
  const cryptoValue = allCryptoAssets.reduce((sum, h) => sum + (h.value || 0), 0);
  
  const fixedIncomeValue = summary?.fixedIncomeValue || 0;
  const variableIncomeValue = summary?.variableIncomeValue || 0;
  const realEstateValue = summary?.realEstateValue || 0;

  const categoryTotals: Record<string, number> = {};
  summary?.holdings.forEach((h) => {
    const cat = h.category === "crypto" || h.market === "crypto" ? "Cripto" : 
                h.category === "stocks" || h.market === "variable_income" ? "Renda Variável" : 
                h.category === "fixed_income" || h.market === "fixed_income" ? "Renda Fixa" :
                h.category === "fii" ? "FIIs" :
                h.category === "real_estate" || h.market === "real_estate" ? "Imóveis" :
                h.category === "cash" ? "Caixa" : "Outros";
    categoryTotals[cat] = (categoryTotals[cat] || 0) + h.value;
  });

  const categoryData = Object.entries(categoryTotals).map(([name, value], index) => ({
    name,
    value,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  const isLoading = summaryLoading;

  const format = (value: number) => isBalanceHidden ? '***' : formatCurrency(value, displayCurrency);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Visão geral do seu portfólio</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddInvestmentDialog onAdd={handleAddInvestment} onAddSnapshot={handleAddSnapshot} isLoading={createInvestmentMutation.isPending || createSnapshotMutation.isPending} />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          <MetricCard
            title="Total do Portfólio"
            value={format(totalPortfolio)}
            icon={Wallet}
          />
          <MetricCard
            title="Cripto"
            value={format(cryptoValue)}
            icon={TrendingUp}
          />
          <MetricCard
            title="Renda Fixa"
            value={format(fixedIncomeValue)}
            icon={Landmark}
          />
          <MetricCard
            title="Renda Variável"
            value={format(variableIncomeValue)}
            icon={BarChart3}
          />
          <MetricCard
            title="Imóveis"
            value={format(realEstateValue)}
            icon={Building2}
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Evolução do Portfólio
            </CardTitle>
            <div className="flex flex-row items-center gap-3 flex-wrap">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-32" data-testid="select-year-dashboard">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                  <SelectItem value="2027">2027</SelectItem>
                  <SelectItem value="2028">2028</SelectItem>
                  <SelectItem value="2029">2029</SelectItem>
                  <SelectItem value="2030">2030</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate("/monthly-snapshots")}
                className="flex items-center gap-2"
                data-testid="button-view-details"
              >
                Ver Detalhes
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
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
            <ResponsiveContainer width="100%" height={550}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="month" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 11 }}
                />
                <YAxis 
                  tickFormatter={(value) => {
                    if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(0)}M`;
                    if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
                    return `R$ ${value.toFixed(0)}`;
                  }}
                />
                <Tooltip 
                  content={({ active, payload }: any) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const value = data.value || 0;
                      const variation = data.variation;
                      const variationPercent = data.variationPercent;
                      
                      return (
                        <div style={{
                          backgroundColor: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: "6px",
                          padding: "12px",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.15)"
                        }}>
                          <p style={{ margin: "0 0 8px 0", fontWeight: "600", color: "hsl(var(--foreground))" }}>
                            {data.month}
                          </p>
                          <p style={{ margin: "4px 0", fontSize: "14px", color: "hsl(var(--foreground))" }}>
                            Patrimônio: <span style={{ fontWeight: "500" }}>R$ {value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </p>
                          {variation !== undefined && variation !== 0 ? (
                            <>
                              <div style={{ margin: "8px 0 0 0", paddingTop: "8px", borderTop: "1px solid hsl(var(--border))" }}>
                                <p style={{ 
                                  margin: "4px 0", 
                                  fontSize: "14px",
                                  color: variation >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)",
                                  fontWeight: "500"
                                }}>
                                  Variação: {variation >= 0 ? "+" : ""}R$ {variation.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p style={{ 
                                  margin: "2px 0", 
                                  fontSize: "12px",
                                  color: variation >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"
                                }}>
                                  {variationPercent >= 0 ? "+" : ""}{variationPercent?.toFixed(2)}%
                                </p>
                              </div>
                            </>
                          ) : (
                            <p style={{ margin: "8px 0 0 0", paddingTop: "8px", borderTop: "1px solid hsl(var(--border))", fontSize: "12px", color: "hsl(var(--muted-foreground))" }}>
                              Primeiro mês do período
                            </p>
                          )}
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend />
                <Bar 
                  dataKey="value" 
                  fill="hsl(var(--primary))" 
                  opacity={0.6}
                  radius={[4, 4, 0, 0]}
                  name="Patrimônio Total"
                />
                <Line 
                  type="monotone" 
                  dataKey="value" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6 }}
                  name="Tendência"
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <ExposureCard 
        cryptoValue={cryptoValue} 
        fixedIncomeValue={fixedIncomeValue}
        variableIncomeValue={variableIncomeValue}
        realEstateValue={realEstateValue}
        formatCurrency={format}
      />

      <PortfolioHoldings
        holdings={summary?.holdings || []}
        isLoading={summaryLoading}
        formatCurrency={format}
        isHidden={isBalanceHidden}
      />
    </div>
  );
}
