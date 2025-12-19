import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

interface Holding {
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
}

interface PortfolioHoldingsProps {
  holdings: Holding[];
  isLoading: boolean;
  formatCurrency: (value: number) => string;
  isHidden: boolean;
}

export function PortfolioHoldings({ holdings, isLoading, formatCurrency, isHidden }: PortfolioHoldingsProps) {
  if (isLoading) {
    return null;
  }

  if (holdings.length === 0) {
    return null;
  }

  const marketColors: Record<string, string> = {
    crypto: "bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100",
    fixed_income: "bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100",
    variable_income: "bg-purple-100 text-purple-900 dark:bg-purple-900 dark:text-purple-100",
    real_estate: "bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100",
  };

  const marketLabels: Record<string, string> = {
    crypto: "Cripto",
    fixed_income: "Renda Fixa",
    variable_income: "Renda Variável",
    real_estate: "Imóveis",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Detalhamento de Investimentos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-2 font-medium">Investimento</th>
                <th className="text-right py-3 px-2 font-medium">Quantidade</th>
                <th className="text-right py-3 px-2 font-medium">Preço Médio</th>
                <th className="text-right py-3 px-2 font-medium">Valor Atual</th>
                <th className="text-right py-3 px-2 font-medium">Total</th>
                <th className="text-right py-3 px-2 font-medium">Ganho/Perda</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding, index) => (
                <tr key={holding.id} className="border-b hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-medium">{holding.name}</p>
                        <p className="text-xs text-muted-foreground">{holding.symbol}</p>
                      </div>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          marketColors[holding.market] || "bg-gray-100 text-gray-900"
                        }`}
                      >
                        {marketLabels[holding.market] || holding.market}
                      </span>
                    </div>
                  </td>
                  <td className="text-right py-3 px-2">
                    {isHidden ? "***" : holding.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}
                  </td>
                  <td className="text-right py-3 px-2">
                    {isHidden ? "***" : formatCurrency(holding.acquisitionPrice)}
                  </td>
                  <td className="text-right py-3 px-2">
                    {isHidden ? "***" : formatCurrency(holding.currentPrice)}
                  </td>
                  <td className="text-right py-3 px-2 font-medium">
                    {isHidden ? "***" : formatCurrency(holding.value)}
                  </td>
                  <td className="text-right py-3 px-2">
                    <div className="flex items-center justify-end gap-1">
                      {isHidden ? (
                        "***"
                      ) : (
                        <>
                          {holding.profitLoss >= 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span className={holding.profitLoss >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                            {formatCurrency(holding.profitLoss)} ({holding.profitLossPercent.toFixed(1)}%)
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
