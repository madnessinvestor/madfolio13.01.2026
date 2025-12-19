import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { FileText, Download, TrendingUp, TrendingDown, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface MonthlyStatement {
  id: string;
  month: number;
  year: number;
  startValue: number;
  endValue: number;
}

interface HistoryPoint {
  month: string;
  year: number;
  value: number;
  variation: number;
}

interface AssetHistory {
  id: string;
  name: string;
  symbol: string;
  market: string;
  isDeleted: number;
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export default function StatementsPage() {
  const { toast } = useToast();
  const currentYear = new Date().getFullYear();
  const [yearFilter, setYearFilter] = useState(currentYear.toString());

  const { data: statements = [], isLoading: statementsLoading } = useQuery<MonthlyStatement[]>({
    queryKey: ["/api/statements", yearFilter],
    queryFn: async () => {
      const res = await fetch(`/api/statements?year=${yearFilter}`);
      if (!res.ok) throw new Error("Failed to fetch statements");
      return res.json();
    },
  });

  const { data: history = [], isLoading: historyLoading } = useQuery<HistoryPoint[]>({
    queryKey: ["/api/portfolio/history"],
  });

  const { data: assetHistory = [] } = useQuery<AssetHistory[]>({
    queryKey: ["/api/assets/history/all"],
  });

  const handleExport = (format: "csv" | "pdf") => {
    if (statements.length === 0) {
      toast({
        title: "Sem dados",
        description: "Não há extratos para exportar.",
        variant: "destructive",
      });
      return;
    }

    if (format === "csv") {
      const headers = ["Mês", "Ano", "Valor Inicial", "Valor Final", "Variação R$", "Variação %"];
      const rows = statements.map((s) => {
        const variation = s.endValue - s.startValue;
        const variationPercent = s.startValue > 0 ? ((variation / s.startValue) * 100) : 0;
        return [
          monthNames[s.month - 1],
          s.year,
          s.startValue.toFixed(2),
          s.endValue.toFixed(2),
          variation.toFixed(2),
          variationPercent.toFixed(2) + "%"
        ].join(",");
      });
      
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `extrato-${yearFilter}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Exportado",
        description: "O arquivo CSV foi baixado.",
      });
    } else {
      toast({
        title: "Em desenvolvimento",
        description: "Exportação em PDF será implementada em breve.",
      });
    }
  };

  const formatCurrency = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const totalVariation = statements.length > 0
    ? statements[0].endValue - statements[statements.length - 1].startValue
    : 0;
  const totalVariationPercent = statements.length > 0 && statements[statements.length - 1].startValue > 0
    ? ((totalVariation / statements[statements.length - 1].startValue) * 100)
    : 0;

  const performanceData = history
    .filter((h) => h.year.toString() === yearFilter)
    .map((h) => ({
      month: h.month,
      value: h.value,
    }));

  const isLoading = statementsLoading || historyLoading;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Extratos Mensais</h1>
          <p className="text-muted-foreground">Acompanhe a evolução do seu patrimônio mês a mês</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-28" data-testid="select-year">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {[currentYear, currentYear - 1, currentYear - 2].map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => handleExport("csv")} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button variant="outline" onClick={() => handleExport("pdf")} data-testid="button-export-pdf">
            <Download className="h-4 w-4 mr-2" />
            PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Meses Registrados</p>
                  <p className="text-2xl font-bold">{statements.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${totalVariation >= 0 ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20"}`}>
                  {totalVariation >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Variação no Ano</p>
                  <p className={`text-2xl font-bold tabular-nums ${totalVariation >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {totalVariation >= 0 ? "+" : ""}{formatCurrency(totalVariation)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-lg ${totalVariationPercent >= 0 ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20"}`}>
                  {totalVariationPercent >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Rentabilidade</p>
                  <p className={`text-2xl font-bold tabular-nums ${totalVariationPercent >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                    {totalVariationPercent >= 0 ? "+" : ""}{totalVariationPercent.toFixed(2)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Histórico de Investimentos</CardTitle>
        </CardHeader>
        <CardContent>
          {assetHistory.length === 0 ? (
            <p className="text-muted-foreground">Nenhum investimento cadastrado</p>
          ) : (
            <div className="space-y-2">
              {assetHistory.map((asset) => (
                <div
                  key={asset.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    asset.isDeleted
                      ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                      : "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800"
                  }`}
                  data-testid={`asset-history-${asset.id}`}
                >
                  <div>
                    <p className={`font-medium ${asset.isDeleted ? "text-red-700 dark:text-red-400 line-through" : "text-green-700 dark:text-green-400"}`}>
                      {asset.name}
                    </p>
                    <p className="text-xs text-muted-foreground">{asset.symbol}</p>
                  </div>
                  <Badge
                    variant={asset.isDeleted ? "destructive" : "secondary"}
                    className="whitespace-nowrap"
                  >
                    {asset.isDeleted ? "Excluído" : "Ativo"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <Skeleton className="h-80 rounded-lg" />
      ) : performanceData.length > 0 ? (
        <PerformanceChart data={performanceData} title="Evolução Mensal" />
      ) : (
        <div className="h-64 rounded-lg border flex items-center justify-center text-muted-foreground">
          Adicione lançamentos para ver a evolução mensal
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Extrato Mensal
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6">
                <Skeleton className="h-64 rounded-lg" />
              </div>
            ) : statements.length > 0 ? (
              <ScrollArea className="h-[400px]">
                <div className="space-y-4 p-6 pt-0">
                  {statements.map((statement) => {
                    const variation = statement.endValue - statement.startValue;
                    const variationPercent = statement.startValue > 0 
                      ? ((variation / statement.startValue) * 100) 
                      : 0;
                    const isPositive = variation >= 0;

                    return (
                      <div
                        key={statement.id}
                        className="border rounded-lg p-4 space-y-3"
                        data-testid={`statement-${statement.year}-${statement.month}`}
                      >
                        <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="font-semibold">
                              {monthNames[statement.month - 1]} {statement.year}
                            </span>
                          </div>
                          <Badge
                            variant={isPositive ? "default" : "destructive"}
                            className="flex items-center gap-1"
                          >
                            {isPositive ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            {isPositive ? "+" : ""}{variationPercent.toFixed(2)}%
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Início do mês</p>
                            <p className="font-medium tabular-nums">{formatCurrency(statement.startValue)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Final do mês</p>
                            <p className="font-medium tabular-nums">{formatCurrency(statement.endValue)}</p>
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <p className={`text-sm font-medium ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            Variação: {isPositive ? "+" : ""}{formatCurrency(variation)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="p-12 text-center text-muted-foreground">
                Nenhum extrato disponível. Adicione lançamentos para gerar extratos mensais.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Comparativo Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-64 rounded-lg" />
            ) : statements.length > 0 ? (
              <div className="space-y-4">
                {statements.map((statement) => {
                  const variation = statement.endValue - statement.startValue;
                  const variationPercent = statement.startValue > 0
                    ? ((variation / statement.startValue) * 100)
                    : 0;
                  const isPositive = variation >= 0;

                  return (
                    <div
                      key={statement.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                      data-testid={`comparison-${statement.year}-${statement.month}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isPositive ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20"}`}>
                          {isPositive ? (
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{monthNames[statement.month - 1]}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">{formatCurrency(statement.endValue)}</p>
                        <p className={`text-sm tabular-nums ${isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {isPositive ? "+" : ""}{variationPercent.toFixed(2)}%
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
