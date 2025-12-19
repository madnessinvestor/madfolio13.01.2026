import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Unlock, Save } from "lucide-react";
import { useDisplayCurrency } from "@/hooks/use-currency";
import type { MonthlyPortfolioSnapshot } from "@shared/schema";

const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export default function MonthlySnapshotsPage() {
  const { toast } = useToast();
  const { displayCurrency } = useDisplayCurrency();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingValues, setEditingValues] = useState<Record<number, string>>({});

  const { data: snapshots = [], isLoading: isLoadingSnapshots } = useQuery({
    queryKey: ["/api/monthly-snapshots", selectedYear],
    queryFn: async () => {
      const response = await apiRequest("GET", `/api/monthly-snapshots?year=${selectedYear}`);
      return (response as unknown as MonthlyPortfolioSnapshot[]);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({ month, totalValue }: { month: number; totalValue: number }) => {
      const response = await apiRequest("POST", "/api/monthly-snapshots", {
        year: selectedYear,
        month,
        totalValue,
        isLocked: 1,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-snapshots", selectedYear] });
      queryClient.invalidateQueries({ queryKey: ["/api/portfolio/history"] });
      toast({
        title: "Sucesso",
        description: "Snapshot mensal salvo com êxito",
      });
      setEditingValues({});
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao salvar snapshot mensal",
        variant: "destructive",
      });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async (snapshotId: string) => {
      return await apiRequest("PATCH", `/api/monthly-snapshots/${snapshotId}/unlock`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/monthly-snapshots", selectedYear] });
      setEditingValues({});
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao desbloquear mês",
        variant: "destructive",
      });
    },
  });

  const monthData = useMemo(() => {
    const data: Record<number, MonthlyPortfolioSnapshot | null> = {};
    for (let i = 1; i <= 12; i++) {
      data[i] = snapshots.find(s => s.month === i) || null;
    }
    return data;
  }, [snapshots]);

  const handleSaveMonth = (month: number) => {
    const value = editingValues[month];
    if (!value || isNaN(Number(value))) {
      toast({
        title: "Valor inválido",
        description: "Por favor, insira um número válido",
        variant: "destructive",
      });
      return;
    }
    saveMutation.mutate({ month, totalValue: Number(value) });
  };

  const handleEditMonth = (month: number, snapshot: MonthlyPortfolioSnapshot | null) => {
    if (snapshot?.isLocked) {
      setEditingValues({ [month]: snapshot.totalValue.toString() });
    } else {
      setEditingValues({ [month]: snapshot?.totalValue.toString() || "" });
    }
  };

  const getYearOptions = () => {
    const years = [];
    for (let i = 2020; i <= new Date().getFullYear() + 2; i++) {
      years.push(i);
    }
    return years;
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Evolução Mensal</h1>
        <p className="text-muted-foreground">Snapshots mensais do seu portfólio</p>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <label className="font-medium">Selecionar Ano:</label>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(Number(e.target.value))}
          className="px-3 py-2 border rounded-md bg-background"
          data-testid="select-year"
        >
          {getYearOptions().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      {isLoadingSnapshots ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 12 }).map((_, i) => {
            const month = i + 1;
            const snapshot = monthData[month];
            const isEditing = month in editingValues;
            const value = editingValues[month];
            const isLocked = snapshot?.isLocked === 1;

            return (
              <Card key={month} className="p-4" data-testid={`card-month-${month}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">{MONTHS[month - 1]}</h3>
                  {isLocked && <Lock className="h-4 w-4 text-amber-500" />}
                </div>

                {isEditing ? (
                  <div className="space-y-3">
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => setEditingValues({ ...editingValues, [month]: e.target.value })}
                      placeholder="Total do portfólio"
                      className="text-sm"
                      data-testid={`input-value-${month}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSaveMonth(month)}
                        disabled={saveMutation.isPending}
                        className="flex-1"
                        data-testid={`button-save-${month}`}
                      >
                        {saveMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Salvar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setEditingValues({})}
                        data-testid={`button-cancel-${month}`}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-2xl font-bold mb-3">
                      {snapshot ? `${displayCurrency} ${snapshot.totalValue.toLocaleString("pt-BR")}` : "—"}
                    </div>
                    <Button
                      size="sm"
                      variant={isLocked ? "destructive" : "outline"}
                      onClick={() => {
                        if (isLocked) {
                          unlockMutation.mutate(snapshot!.id);
                        } else {
                          handleEditMonth(month, snapshot);
                        }
                      }}
                      disabled={unlockMutation.isPending}
                      className="w-full"
                      data-testid={`button-${isLocked ? "edit" : "add"}-${month}`}
                    >
                      {isLocked ? (
                        <>
                          <Unlock className="h-4 w-4 mr-2" />
                          Editar
                        </>
                      ) : (
                        "Adicionar"
                      )}
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
