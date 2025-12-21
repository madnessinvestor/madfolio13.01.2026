import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Plus, TrendingUp, TrendingDown } from "lucide-react";

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  avgPrice: number;
  currentPrice: number;
  change24h: number;
  type: "crypto" | "stock" | "etf" | "fii" | "real_estate";
}

interface HoldingsTableProps {
  title: string;
  holdings: Holding[];
  onAdd?: () => void;
  onEdit?: (holding: Holding) => void;
  onDelete?: (holding: Holding) => void;
  isHidden?: boolean;
  fixedIncome?: boolean;
}

export function HoldingsTable({
  title,
  holdings,
  onAdd,
  onEdit,
  onDelete,
  isHidden,
  fixedIncome = false,
}: HoldingsTableProps) {
  const formatCurrency = (value: number) =>
    isHidden ? '***' : `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const formatAmount = (value: number, type: string) => {
    if (isHidden) return '***';
    if (type === "crypto") {
      return value.toLocaleString("pt-BR", { maximumFractionDigits: 8 });
    }
    return value.toLocaleString("pt-BR");
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        {onAdd && (
          <Button size="sm" onClick={onAdd} data-testid="button-add-holding">
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ativo</TableHead>
                <TableHead className="text-right">Quantidade</TableHead>
                <TableHead className="text-right">{fixedIncome ? "Valor Inicial" : "Preço Médio"}</TableHead>
                <TableHead className="text-right">{fixedIncome ? "Valor Atual" : "Preço Atual"}</TableHead>
                {fixedIncome && <TableHead className="text-right">Valorização (R$)</TableHead>}
                <TableHead className="text-right">{fixedIncome ? "Lucro/Perda Total (%)" : "Lucro/Perda %"}</TableHead>
                {!fixedIncome && <TableHead className="text-right">24h</TableHead>}
                <TableHead className="text-right sr-only">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((holding) => {
                const totalValue = holding.amount * holding.currentPrice;
                const totalCost = holding.amount * holding.avgPrice;
                const profitLoss = totalValue - totalCost;
                const profitLossPercent = ((totalValue - totalCost) / totalCost) * 100;
                const isProfit = profitLoss >= 0;

                return (
                  <TableRow key={holding.id} data-testid={`row-holding-${holding.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <p className="font-medium">{holding.symbol}</p>
                          <p className="text-xs text-muted-foreground">{holding.name}</p>
                        </div>
                        <Badge variant="secondary" className="text-xs">
                          {holding.type.toUpperCase()}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(holding.amount, holding.type)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(holding.avgPrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(holding.currentPrice)}
                    </TableCell>
                    {fixedIncome && (
                      <TableCell className="text-right tabular-nums">
                        <span className={isProfit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                          {isProfit ? "+" : ""}{formatCurrency(profitLoss)}
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className={`flex items-center justify-end gap-1 ${isProfit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {isProfit ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        <span className="tabular-nums text-sm">
                          {isProfit ? "+" : ""}{profitLossPercent.toFixed(2)}%
                        </span>
                      </div>
                    </TableCell>
                    {!fixedIncome && (
                      <TableCell className="text-right">
                        <span className={`tabular-nums text-sm ${holding.change24h >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {holding.change24h >= 0 ? "+" : ""}{holding.change24h.toFixed(2)}%
                        </span>
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {onEdit && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onEdit(holding)}
                            data-testid={`button-edit-${holding.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {onDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onDelete(holding)}
                            data-testid={`button-delete-${holding.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
