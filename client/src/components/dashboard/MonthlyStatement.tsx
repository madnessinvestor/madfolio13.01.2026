import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Calendar, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface MonthlyStatementData {
  id: string;
  month: number;
  year: number;
  startValue: number;
  endValue: number;
  transactions: {
    date: string;
    assetSymbol: string;
    value: number;
    type: "snapshot";
  }[];
}

interface MonthlyStatementProps {
  statements: MonthlyStatementData[];
}

const monthNames = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function MonthlyStatement({ statements }: MonthlyStatementProps) {
  const formatCurrency = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Extrato Mensal
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
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

                  {statement.transactions.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground mb-2">
                        {statement.transactions.length} lançamento(s) no mês
                      </p>
                      <div className="space-y-1">
                        {statement.transactions.slice(0, 3).map((tx, idx) => (
                          <div key={idx} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">
                              {new Date(tx.date).toLocaleDateString("pt-BR")} - {tx.assetSymbol}
                            </span>
                            <span className="tabular-nums font-medium">
                              {formatCurrency(tx.value)}
                            </span>
                          </div>
                        ))}
                        {statement.transactions.length > 3 && (
                          <p className="text-xs text-muted-foreground">
                            +{statement.transactions.length - 3} mais...
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
