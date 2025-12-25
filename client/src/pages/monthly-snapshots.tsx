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
import {
  Calendar,
  Loader2,
  TrendingUp,
  TrendingDown,
  Save,
  Lock,
  Minus,
  RefreshCw,
  Download,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Bar,
} from "recharts";
import * as XLSX from "xlsx";
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

const monthShortNames = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

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
  const [monthUpdates, setMonthUpdates] = useState<
    Record<string, Record<string, string>>
  >({});
  const [monthUpdateDates, setMonthUpdateDates] = useState<
    Record<string, string>
  >({});
  const [monthLockedStatus, setMonthLockedStatus] = useState<
    Record<number, boolean>
  >({});
  const [savingMonths, setSavingMonths] = useState<Set<number>>(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const originalDataRef = useRef<Record<string, Record<string, string>>>({});

  // Initialize useEffect for year persistence (this ensures it runs client-side only)
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync portfolio evolution when page loads
  useEffect(() => {
    const syncPortfolio = async () => {
      try {
        await apiRequest("POST", "/api/portfolio/sync");
        // Refresh snapshots data after sync
        queryClient.invalidateQueries({ queryKey: ["/api/snapshots/year"] });
        queryClient.invalidateQueries({
          queryKey: ["/api/snapshots/month-status"],
        });
      } catch (error) {
        console.error("Failed to sync portfolio evolution:", error);
      }
    };

    if (mounted) {
      syncPortfolio();
    }
  }, [mounted]);

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
    const data: Array<{ month: string; value: number; locked: boolean }> = [];
    const year = parseInt(selectedYear);

    // Generate 12 months for the selected year
    for (let month = 0; month < 12; month++) {
      // Check if month is locked (registered)
      const isLocked = monthLockedStatus[month] === true;
      const monthTotal = getMonthTotalValue(month);

      data.push({
        month: monthShortNames[month],
        value: isLocked ? monthTotal : 0,
        locked: isLocked,
      });
    }

    return data;
  }, [monthLockedStatus, monthUpdates, selectedYear]);

  const monthSequence = getMonthSequence();

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const { data: yearSnapshots = {} } = useQuery<
    Record<string, Record<number, SnapshotData>>
  >({
    queryKey: ["/api/snapshots/year", selectedYear],
  });

  const { data: monthStatus = {} } = useQuery<Record<number, boolean>>({
    queryKey: ["/api/snapshots/month-status", selectedYear],
  });

  const previousYear = (parseInt(selectedYear) - 1).toString();
  const { data: previousYearSnapshots = {} } = useQuery<
    Record<string, Record<number, SnapshotData>>
  >({
    queryKey: ["/api/snapshots/year", previousYear],
    enabled: monthSequence.includes(0),
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
          // For locked months, ONLY use saved snapshot values
          // For unlocked months, use snapshot value if available, otherwise calculate from current price
          const isMonthLocked = monthLockedStatus[month + 1] === true;
          let value = 0;

          if (isMonthLocked && monthData?.value) {
            // Locked month: use saved snapshot value (immutable)
            value = monthData.value;
          } else if (monthData?.value) {
            // Unlocked month with snapshot: use snapshot as base
            value = monthData.value;
          } else {
            // No snapshot: calculate from current price (only for unlocked months)
            if (!isMonthLocked) {
              value = (asset.quantity || 0) * (asset.currentPrice || 0) || 0;
            }
          }

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
        newMonthUpdateDates[monthKey] = latestDate
          ? new Date(latestDate).toLocaleDateString("pt-BR")
          : "";
      }

      setMonthDates(newMonthDates);
      setMonthUpdates(newMonthUpdates);
      setMonthUpdateDates(newMonthUpdateDates);
      originalDataRef.current = JSON.parse(JSON.stringify(newMonthUpdates));
    }
  }, [assets, selectedYear, yearSnapshots, monthLockedStatus]);

  // Update monthUpdates when assets change and month is not locked
  // This effect only updates UNLOCKED months with current price changes
  useEffect(() => {
    if (assets.length > 0) {
      setMonthUpdates((prev) => {
        const newUpdates = { ...prev };
        const year = parseInt(selectedYear);

        for (let month = 0; month < 12; month++) {
          const monthKey = month.toString();
          const isLocked = monthLockedStatus[month + 1] === true; // monthLockedStatus uses 1-based month

          // ONLY update unlocked months
          if (!isLocked) {
            newUpdates[monthKey] = { ...newUpdates[monthKey] };
            assets.forEach((asset) => {
              // Only update if there's no saved snapshot for this month
              const monthData = yearSnapshots[asset.id]?.[month];
              if (!monthData?.value) {
                const currentValue =
                  (asset.quantity || 0) * (asset.currentPrice || 0);
                newUpdates[monthKey][asset.id] =
                  formatCurrencyInput(currentValue);
              }
            });
          }
          // Locked months are NOT updated here - they keep their snapshot values
        }

        return newUpdates;
      });
    }
  }, [assets, monthLockedStatus, selectedYear, yearSnapshots]);

  const formatCurrencyInput = (value: number): string => {
    return value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatCurrencyDisplay = (value: number): string => {
    return `R$ ${value.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const calculateEvolution = (currentValue: number, previousValue: number) => {
    if (previousValue === 0) return { percentage: 0, value: 0 };
    const valueDiff = currentValue - previousValue;
    const percentageDiff = (valueDiff / previousValue) * 100;
    return { percentage: percentageDiff, value: valueDiff };
  };

  const lockMonthMutation = useMutation({
    mutationFn: async ({
      year,
      month,
      locked,
    }: {
      year: number;
      month: number;
      locked: boolean;
    }) => {
      return apiRequest("PATCH", "/api/snapshots/month/lock", {
        year,
        month,
        locked,
      });
    },
    onSuccess: (_, { year, month, locked }) => {
      queryClient.invalidateQueries({
        queryKey: ["/api/snapshots/month-status", year.toString()],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/snapshots/year", year.toString()],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });

      toast({
        title: locked ? "Mês bloqueado" : "Mês desbloqueado",
        description: locked
          ? `${monthShortNames[month]} ${year} está bloqueado`
          : `${monthShortNames[month]} ${year} foi desbloqueado`,
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
      const assetUpdates: Array<{ assetId: string; value: number }> = [];
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
          assetUpdates.push({ assetId, value });
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

      // Update currentPrice for each asset based on snapshot values
      for (const assetUpdate of assetUpdates) {
        const asset = assets.find((a) => a.id === assetUpdate.assetId);
        if (asset && asset.quantity > 0) {
          // Calculate new current price: total value / quantity
          const newCurrentPrice = assetUpdate.value / asset.quantity;
          await apiRequest("PATCH", `/api/assets/${assetUpdate.assetId}`, {
            currentPrice: newCurrentPrice,
          }).catch(() => {
            // Continue even if individual asset update fails
            console.error(
              `Failed to update currentPrice for asset ${assetUpdate.assetId}`
            );
          });
        }
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
        description:
          error instanceof Error ? error.message : "Falha ao salvar mês",
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

  const handleSyncInvestments = async () => {
    setIsSyncing(true);
    try {
      // First, sync with backend
      await apiRequest("POST", "/api/portfolio/sync");

      // Refetch assets and snapshots to get latest data
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["/api/assets"] }),
        queryClient.refetchQueries({
          queryKey: ["/api/snapshots/year", selectedYear],
        }),
        queryClient.refetchQueries({
          queryKey: ["/api/snapshots/month-status", selectedYear],
        }),
      ]);

      // Wait a bit for React Query to update the cache
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Get fresh data
      const freshAssets =
        queryClient.getQueryData<Asset[]>(["/api/assets"]) || [];
      const freshYearSnapshots =
        queryClient.getQueryData<Record<string, Record<number, SnapshotData>>>([
          "/api/snapshots/year",
          selectedYear,
        ]) || {};
      const freshMonthStatus =
        queryClient.getQueryData<Record<number, boolean>>([
          "/api/snapshots/month-status",
          selectedYear,
        ]) || {};

      const year = parseInt(selectedYear);

      console.log("[Sync] Fresh data:", {
        assetsCount: freshAssets.length,
        monthStatus: freshMonthStatus,
        selectedYear: year,
      });

      // Update monthLockedStatus first to ensure consistency
      setMonthLockedStatus(freshMonthStatus);

      // Update monthDates for unlocked months with last day of month
      setMonthDates((prev) => {
        const newDates = { ...prev };

        for (let month = 0; month < 12; month++) {
          const monthKey = month.toString();
          const isLocked = freshMonthStatus[month + 1] === true;

          console.log(
            `[Sync] Month ${month + 1} (${monthKey}): locked=${isLocked}`
          );

          // ONLY update dates for unlocked months
          if (!isLocked) {
            // Calculate last day of month: month + 1 for next month, day 0 gives last day of previous month
            const lastDayOfMonth = new Date(year, month + 1, 0);
            newDates[monthKey] = lastDayOfMonth.toISOString().split("T")[0];
            console.log(
              `[Sync] Updated date for month ${month + 1}: ${
                newDates[monthKey]
              }`
            );
          }
        }

        return newDates;
      });

      // Update monthUpdates with fresh calculated values for unlocked months
      // This runs LAST to ensure it's not overwritten by useEffect
      setTimeout(() => {
        setMonthUpdates((prev) => {
          const newUpdates = { ...prev };

          // Iterate through all 12 months
          for (let month = 0; month < 12; month++) {
            const monthKey = month.toString();
            const isLocked = freshMonthStatus[month + 1] === true; // monthStatus uses 1-based month

            // ONLY update unlocked months
            if (!isLocked) {
              // Force create new object to trigger React update
              newUpdates[monthKey] = {};

              console.log(`[Sync] Updating values for month ${month + 1}`);

              // Update each asset by its ID
              freshAssets.forEach((asset) => {
                // Calculate current value: quantity * currentPrice
                const currentValue =
                  (asset.quantity || 0) * (asset.currentPrice || 0);

                console.log(
                  `[Sync] Asset ${asset.symbol}: value=${currentValue}`
                );

                // ALWAYS use current calculated value for unlocked months
                newUpdates[monthKey][asset.id] =
                  formatCurrencyInput(currentValue);
              });
            } else {
              // Keep existing values for locked months
              newUpdates[monthKey] = prev[monthKey] || {};
            }
          }

          console.log("[Sync] Final updates:", newUpdates);
          return newUpdates;
        });
      }, 150);

      toast({
        title: "Investimentos atualizados",
        description:
          "Os investimentos não registrados foram atualizados com sucesso.",
      });
    } catch (error) {
      toast({
        title: "Erro ao atualizar",
        description:
          "Não foi possível atualizar os investimentos. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportToExcel = async () => {
    try {
      toast({
        title: "Gerando arquivo Excel",
        description: "Aguarde enquanto coletamos os dados...",
      });

      // Fetch all years data (2025-2030)
      const years = ["2025", "2026", "2027", "2028", "2029", "2030"];
      const allYearsData: Array<{
        year: string;
        snapshots: Record<string, Record<number, SnapshotData>>;
        monthStatus: Record<number, boolean>;
      }> = [];

      for (const year of years) {
        try {
          const snapshots = await apiRequest<
            Record<string, Record<number, SnapshotData>>
          >("GET", `/api/snapshots/year/${year}`);
          const monthStatus = await apiRequest<Record<number, boolean>>(
            "GET",
            `/api/snapshots/month-status/${year}`
          );

          allYearsData.push({ year, snapshots, monthStatus });
        } catch (error) {
          console.error(`Error fetching data for year ${year}:`, error);
        }
      }

      // Build list of ALL locked months across all years (sequentially)
      interface LockedMonthData {
        year: string;
        month: number; // 0-11
        monthStr: string; // "01/2025"
        assetValues: Record<string, number>; // assetId -> value
        total: number;
      }

      const allLockedMonths: LockedMonthData[] = [];

      allYearsData.forEach(({ year, snapshots, monthStatus }) => {
        for (let month = 0; month < 12; month++) {
          // Only include locked months (monthStatus uses 0-based index: 0-11)
          const isLocked = monthStatus[month] === true;

          if (!isLocked) {
            continue; // Skip unlocked months
          }

          const assetValues: Record<string, number> = {};
          let monthTotal = 0;

          // Collect values for all assets in this month
          Object.keys(snapshots).forEach((assetId) => {
            const monthData = snapshots[assetId]?.[month];
            const value = monthData?.value ?? 0;

            // Add value if snapshot exists (locked status already checked above)
            if (value > 0) {
              assetValues[assetId] = value;
              monthTotal += value;
            }
          });

          allLockedMonths.push({
            year,
            month,
            monthStr: `${String(month + 1).padStart(2, "0")}/${year}`,
            assetValues,
            total: monthTotal,
          });
        }
      });

      if (allLockedMonths.length === 0) {
        toast({
          title: "Nenhum dado para exportar",
          description: "Não há meses salvos/bloqueados para exportar.",
          variant: "destructive",
        });
        return;
      }

      console.log(`Exporting ${allLockedMonths.length} locked months`);

      // Collect all unique asset IDs from locked months
      const allAssetIds = new Set<string>();
      allLockedMonths.forEach(({ assetValues }) => {
        Object.keys(assetValues).forEach((id) => allAssetIds.add(id));
      });

      // Create asset map for lookups
      const assetMap = new Map<string, Asset>();
      assets.forEach((asset) => assetMap.set(asset.id, asset));

      // Prepare Excel data structure
      const exportData: any[] = [];

      // Add header row for asset values (first row with asset names)
      const headerRow: any = {
        "Mês/Ano": "Mês/Ano",
      };

      Array.from(allAssetIds).forEach((assetId) => {
        const asset = assetMap.get(assetId);
        if (asset) {
          headerRow[`${asset.symbol}`] = asset.name;
        }
      });

      headerRow["TOTAL"] = "Valor Total do Portfólio";
      headerRow["Variação R$"] = "Variação (R$)";
      headerRow["Variação %"] = "Variação (%)";

      exportData.push(headerRow);

      // Add data rows (one per locked month)
      allLockedMonths.forEach((monthData, index) => {
        const row: any = {
          "Mês/Ano": monthData.monthStr,
        };

        // Add value for each asset
        Array.from(allAssetIds).forEach((assetId) => {
          const asset = assetMap.get(assetId);
          if (asset) {
            const value = monthData.assetValues[assetId] ?? 0;
            row[`${asset.symbol}`] = new Intl.NumberFormat("pt-BR", {
              style: "currency",
              currency: "BRL",
            }).format(value);
          }
        });

        // Add total
        row["TOTAL"] = new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
        }).format(monthData.total);

        // Calculate variation (same logic as "Extrato de Variação Mensal")
        const isFirstMonth = index === 0;

        if (isFirstMonth) {
          row["Variação R$"] = "-";
          row["Variação %"] = "-";
        } else {
          const previousTotal = allLockedMonths[index - 1].total;
          const variation = monthData.total - previousTotal;
          const variationPercent =
            previousTotal !== 0 ? (variation / previousTotal) * 100 : 0;

          row["Variação R$"] = new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
            signDisplay: "always",
          }).format(variation);

          row["Variação %"] = `${
            variationPercent > 0 ? "+" : ""
          }${variationPercent.toFixed(2)}%`;
        }

        exportData.push(row);
      });

      // Create worksheet
      const ws = XLSX.utils.json_to_sheet(exportData);

      // Set column widths
      const colWidths = [{ wch: 12 }]; // Mês/Ano column

      // Asset columns
      Array.from(allAssetIds).forEach(() => {
        colWidths.push({ wch: 18 });
      });

      // Total, Variation R$ and %
      colWidths.push({ wch: 18 }); // TOTAL
      colWidths.push({ wch: 18 }); // Variação R$
      colWidths.push({ wch: 15 }); // Variação %

      ws["!cols"] = colWidths;

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Evolução do Portfólio");

      // Generate filename with current date
      const now = new Date();
      const filename = `evolucao_portfolio_${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.xlsx`;

      // Download file
      XLSX.writeFile(wb, filename);

      toast({
        title: "Exportação concluída",
        description: `Arquivo ${filename} baixado! ${allLockedMonths.length} meses bloqueados exportados.`,
      });
    } catch (error) {
      console.error("Error exporting to Excel:", error);
      toast({
        title: "Erro na exportação",
        description: "Não foi possível exportar os dados. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const years = Array.from({ length: 6 }, (_, i) => (2025 + i).toString());

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Evolução do Portfólio</h1>
          <p className="text-muted-foreground mt-2">
            Atualize valores por mês. Clique em "Salvar" para bloquear o mês no
            gráfico
          </p>
        </div>
      </div>

      <Card>
        <CardHeader></CardHeader>
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
              <ComposedChart
                data={chartData}
                margin={{ top: 5, right: 30, left: 0, bottom: 80 }}
              >
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
                    if (value >= 1000000)
                      return `R$ ${(value / 1000000).toFixed(0)}M`;
                    if (value >= 1000)
                      return `R$ ${(value / 1000).toFixed(0)}k`;
                    return `R$ ${value.toFixed(0)}`;
                  }}
                />
                <Tooltip
                  formatter={(value: number) => {
                    if (!value) return ["-", "Valor"];
                    return [
                      `R$ ${value.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`,
                      "Patrimônio",
                    ];
                  }}
                  contentStyle={{
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "6px",
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Investimentos - {selectedYear}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncInvestments}
                disabled={isSyncing}
                className="flex items-center gap-2"
              >
                <RefreshCw
                  className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`}
                />
                {isSyncing ? "Atualizando..." : "Atualizar Investimentos"}
              </Button>
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
                <div
                  className="overflow-x-auto overflow-y-visible scrollbar-visible"
                  style={{ scrollBehavior: "smooth" }}
                >
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b bg-background">
                        <th className="sticky left-0 z-20 bg-background border-r px-4 py-3 text-left font-semibold min-w-40">
                          Investimento
                        </th>
                        {monthSequence.map((actualMonth, displayIdx) => (
                          <th
                            key={displayIdx}
                            className="border-r px-2 py-2 text-center font-semibold min-w-32"
                          >
                            <div className="text-xs font-medium">
                              {monthShortNames[actualMonth]}
                            </div>
                            <div className="text-xs text-muted-foreground font-normal">
                              {monthLockedStatus[actualMonth]
                                ? "Registrado"
                                : "Data"}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* Date input row */}
                      <tr className="border-b bg-muted/20">
                        <td className="sticky left-0 z-10 bg-muted/20 border-r px-4 py-2 text-xs font-medium">
                          Data
                        </td>
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
                        <tr
                          key={asset.id}
                          className="border-b hover:bg-muted/50"
                        >
                          <td className="sticky left-0 z-10 bg-background hover:bg-muted/50 border-r px-4 py-3">
                            <p className="font-semibold text-sm">
                              {asset.symbol}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {asset.name}
                            </p>
                          </td>
                          {monthSequence.map((actualMonth, displayIdx) => {
                            const isMonthLocked =
                              monthLockedStatus[actualMonth];

                            // Calculate individual asset evolution (same logic as Total do Mês)
                            const currentValue = parseCurrencyValue(
                              monthUpdates[actualMonth]?.[asset.id] || "0"
                            );
                            let previousValue = currentValue;
                            let showVariation = false;

                            if (displayIdx > 0) {
                              const prevMonth = monthSequence[displayIdx - 1];
                              previousValue = parseCurrencyValue(
                                monthUpdates[prevMonth]?.[asset.id] || "0"
                              );
                              showVariation = true;
                            } else if (actualMonth === 0) {
                              // January: compare with December of previous year
                              const decemberSnapshot =
                                previousYearSnapshots[asset.id]?.[11]; // December is month 11
                              if (
                                decemberSnapshot?.value &&
                                decemberSnapshot.value > 0
                              ) {
                                previousValue = decemberSnapshot.value;
                                showVariation = true;
                              }
                            }

                            const evolution = calculateEvolution(
                              currentValue,
                              previousValue
                            );

                            return (
                              <td
                                key={displayIdx}
                                className="border-r px-2 py-2"
                              >
                                <input
                                  type="text"
                                  value={
                                    monthUpdates[actualMonth]?.[asset.id] || ""
                                  }
                                  onChange={(e) =>
                                    handleValueChange(
                                      asset.id,
                                      actualMonth.toString(),
                                      e.target.value
                                    )
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
                                {isMonthLocked &&
                                  showVariation &&
                                  currentValue > 0 && (
                                    <div className="mt-1 space-y-0.5">
                                      <div
                                        className={`text-xs font-medium ${
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
                                      <div
                                        className={`text-xs font-medium ${
                                          evolution.value > 0
                                            ? "text-green-600 dark:text-green-400"
                                            : evolution.value < 0
                                            ? "text-red-600 dark:text-red-400"
                                            : "text-muted-foreground"
                                        }`}
                                      >
                                        {evolution.percentage > 0 ? "+" : ""}
                                        {evolution.percentage.toFixed(2)}%
                                      </div>
                                    </div>
                                  )}
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
                          let previousTotal = currentTotal;
                          let showVariation = false;

                          if (displayIdx > 0) {
                            previousTotal = getMonthTotalValue(
                              monthSequence[displayIdx - 1]
                            );
                            showVariation = true;
                          } else if (actualMonth === 0) {
                            // January: compare with December of previous year
                            const decemberValue = Object.values(
                              previousYearSnapshots
                            ).reduce((total, assetData) => {
                              const decemberSnapshot = assetData?.[11]; // December is month 11
                              return total + (decemberSnapshot?.value || 0);
                            }, 0);

                            if (decemberValue > 0) {
                              previousTotal = decemberValue;
                              showVariation = true;
                            }
                          }

                          const evolution = calculateEvolution(
                            currentTotal,
                            previousTotal
                          );
                          const isMonthLocked = monthLockedStatus[actualMonth];

                          return (
                            <td key={displayIdx} className="border-r px-2 py-2">
                              <div className="text-center">
                                <div
                                  className={`text-sm font-semibold transition-colors ${
                                    isMonthLocked
                                      ? "text-gray-400 dark:text-gray-500"
                                      : ""
                                  }`}
                                >
                                  {formatCurrencyDisplay(currentTotal)}
                                </div>
                                {showVariation && (
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
                                      {evolution.value > 0 ? "+" : ""}
                                      {formatCurrencyDisplay(evolution.value)}
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
                                      {evolution.percentage > 0 ? "+" : ""}
                                      {evolution.percentage.toFixed(2)}%
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
                💡 Dica: Clique em "Salvar" (verde) abaixo de cada mês para
                bloquear. Valores bloqueados aparecem em cinza e no gráfico.
                Clique em "Editar" (vermelho) para desbloquear.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extrato da Evolução do Portfólio</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-background">
                  <th className="px-4 py-3 text-left font-semibold">Mês/Ano</th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Valor do Portfólio
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Variação (R$)
                  </th>
                  <th className="px-4 py-3 text-right font-semibold">
                    Variação (%)
                  </th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const year = parseInt(selectedYear);
                  const lockedMonths: Array<{
                    month: number;
                    total: number;
                    monthStr: string;
                  }> = [];

                  for (let month = 0; month < 12; month++) {
                    if (monthLockedStatus[month]) {
                      const total = getMonthTotalValue(month);
                      const monthName = monthShortNames[month];
                      const monthStr = `${String(month + 1).padStart(
                        2,
                        "0"
                      )}/${year}`;
                      lockedMonths.push({ month, total, monthStr });
                    }
                  }

                  if (lockedMonths.length === 0) {
                    return (
                      <tr>
                        <td
                          colSpan={4}
                          className="h-24 text-center text-muted-foreground"
                        >
                          Nenhum mês registrado. Bloqueie meses na tabela acima
                          para visualizar o extrato.
                        </td>
                      </tr>
                    );
                  }

                  return lockedMonths.map((item, index) => {
                    const previousTotal =
                      index > 0 ? lockedMonths[index - 1].total : item.total;
                    const variation = item.total - previousTotal;
                    const variationPercent =
                      previousTotal !== 0
                        ? (variation / previousTotal) * 100
                        : 0;
                    const isFirstMonth = index === 0;

                    return (
                      <tr
                        key={`${year}-${item.month}`}
                        className="border-b hover:bg-muted/50"
                      >
                        <td className="px-4 py-3 font-medium">
                          {item.monthStr}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: "BRL",
                          }).format(item.total)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {isFirstMonth ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              {variation > 0 ? (
                                <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                  <TrendingUp className="h-4 w-4" />
                                  {new Intl.NumberFormat("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  }).format(variation)}
                                </span>
                              ) : variation < 0 ? (
                                <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                  <TrendingDown className="h-4 w-4" />
                                  {new Intl.NumberFormat("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  }).format(Math.abs(variation))}
                                </span>
                              ) : (
                                <span className="text-muted-foreground flex items-center gap-1">
                                  <Minus className="h-4 w-4" />
                                  R$ 0,00
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {isFirstMonth ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            <span
                              className={
                                variationPercent > 0
                                  ? "text-green-600 dark:text-green-400 font-semibold"
                                  : variationPercent < 0
                                  ? "text-red-600 dark:text-red-400 font-semibold"
                                  : "text-muted-foreground"
                              }
                            >
                              {variationPercent > 0 ? "+" : ""}
                              {variationPercent.toFixed(2)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
