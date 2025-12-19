import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PortfolioHistory } from "@shared/schema";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { TrendingUp, TrendingDown, Minus, Loader2 } from "lucide-react";
import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { useDisplayCurrency } from "@/App";

export default function HistoryPage() {
  const { displayCurrency } = useDisplayCurrency();
  const { data: history, isLoading } = useQuery<PortfolioHistory[]>({
    queryKey: ["/api/portfolio/history"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const sortedHistory = [...(history || [])].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const historyWithChanges = sortedHistory.map((item, index) => {
    const nextItem = sortedHistory[index + 1];
    if (!nextItem) return { ...item, diff: 0, diffPercent: 0 };

    const diff = item.totalValue - nextItem.totalValue;
    const diffPercent = (diff / nextItem.totalValue) * 100;

    return { ...item, diff, diffPercent };
  });

  const chartData = [...sortedHistory].reverse().map(item => ({
    month: format(new Date(item.date), "MMM/yy", { locale: ptBR }),
    value: item.totalValue
  }));

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Evolução do Patrimônio</h1>
        <p className="text-muted-foreground">Acompanhe o crescimento da sua carteira mês a mês.</p>
      </div>

      {chartData.length > 0 && (
        <PerformanceChart data={chartData} title="Evolução Patrimonial" />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Histórico Detalhado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mês/Ano</TableHead>
                  <TableHead className="text-right">Patrimônio Total</TableHead>
                  <TableHead className="text-right">Variação (R$)</TableHead>
                  <TableHead className="text-right">Variação (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyWithChanges.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium capitalize">
                      {format(new Date(item.date), "MMMM 'de' yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: displayCurrency }).format(item.totalValue)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        {item.diff > 0 ? (
                          <span className="text-green-500 flex items-center gap-1">
                            <TrendingUp className="h-4 w-4" />
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: displayCurrency }).format(item.diff)}
                          </span>
                        ) : item.diff < 0 ? (
                          <span className="text-red-500 flex items-center gap-1">
                            <TrendingDown className="h-4 w-4" />
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: displayCurrency }).format(Math.abs(item.diff))}
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            <Minus className="h-4 w-4" />
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: displayCurrency }).format(0)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      <span className={item.diffPercent > 0 ? "text-green-500" : item.diffPercent < 0 ? "text-red-500" : "text-muted-foreground"}>
                        {item.diffPercent > 0 ? "+" : ""}{item.diffPercent.toFixed(2)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
                {historyWithChanges.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      Nenhum dado de evolução disponível.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
