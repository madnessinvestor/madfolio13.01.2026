import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Bitcoin, Landmark, BarChart3, Building2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface ExposureCardProps {
  cryptoValue: number;
  fixedIncomeValue: number;
  variableIncomeValue: number;
  realEstateValue?: number;
  formatCurrency?: (value: number) => string;
}

export function ExposureCard({ cryptoValue, fixedIncomeValue, variableIncomeValue, realEstateValue = 0, formatCurrency: customFormat }: ExposureCardProps) {
  const total = cryptoValue + fixedIncomeValue + variableIncomeValue + realEstateValue;
  const cryptoPercent = total > 0 ? (cryptoValue / total) * 100 : 0;
  const fixedIncomePercent = total > 0 ? (fixedIncomeValue / total) * 100 : 0;
  const variableIncomePercent = total > 0 ? (variableIncomeValue / total) * 100 : 0;
  const realEstatePercent = total > 0 ? (realEstateValue / total) * 100 : 0;

  const formatDefault = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const format = customFormat || formatDefault;

  // Create market exposure data for pie chart
  const exposureData = [
    { name: "Mercado Cripto", value: cryptoValue, color: "hsl(var(--chart-1))" },
    { name: "Renda Fixa", value: fixedIncomeValue, color: "hsl(var(--chart-2))" },
    { name: "Renda Variável", value: variableIncomeValue, color: "hsl(var(--chart-3))" },
    { name: "Imóveis", value: realEstateValue, color: "hsl(var(--chart-4))" },
  ].filter(item => item.value > 0);

  const renderCustomLabel = ({ percent }: { percent: number }) => {
    if (percent < 0.05) return null;
    return `${(percent * 100).toFixed(0)}%`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Exposição por Mercado</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Exposição por Mercado - Left Column */}
          <div className="space-y-4">
            <h3 className="font-semibold text-sm">Exposição por Mercado</h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-chart-1/10">
                    <Bitcoin className="h-4 w-4 text-chart-1" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Mercado Cripto</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {format(cryptoValue)}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums">
                  {cryptoPercent.toFixed(1)}%
                </span>
              </div>
              <Progress value={cryptoPercent} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-chart-2/10">
                    <Landmark className="h-4 w-4 text-chart-2" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Renda Fixa</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {format(fixedIncomeValue)}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums">
                  {fixedIncomePercent.toFixed(1)}%
                </span>
              </div>
              <Progress value={fixedIncomePercent} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-chart-3/10">
                    <BarChart3 className="h-4 w-4 text-chart-3" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Renda Variável</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {format(variableIncomeValue)}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums">
                  {variableIncomePercent.toFixed(1)}%
                </span>
              </div>
              <Progress value={variableIncomePercent} className="h-2" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-chart-4/10">
                    <Building2 className="h-4 w-4 text-chart-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Imóveis</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {format(realEstateValue)}
                    </p>
                  </div>
                </div>
                <span className="text-lg font-bold tabular-nums">
                  {realEstatePercent.toFixed(1)}%
                </span>
              </div>
              <Progress value={realEstatePercent} className="h-2" />
            </div>

            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="text-xl font-bold tabular-nums">{format(total)}</span>
              </div>
            </div>
          </div>

          {/* Exposição por Mercado - Gráfico Pizza */}
          {exposureData.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-4">Distribuição de Exposição</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={exposureData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={renderCustomLabel}
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {exposureData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [
                        `${format(value)} (${((value / total) * 100).toFixed(1)}%)`,
                        "Valor"
                      ]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        borderColor: "hsl(var(--border))",
                        borderRadius: "0.5rem",
                      }}
                      labelStyle={{ color: "hsl(var(--foreground))" }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-1">
                {exposureData.map((item, index) => (
                  <div key={index} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <span className="tabular-nums font-medium">
                      {format(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
