import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Bitcoin, Landmark, BarChart3, Building2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";

interface ExposureCardProps {
  cryptoValue: number;
  fixedIncomeValue: number;
  variableIncomeValue: number;
  realEstateValue?: number;
  formatCurrency?: (value: number) => string;
}

interface AssetItem {
  name: string;
  value: number;
  percent: number;
  color: string;
  icon: React.ElementType;
}

export function ExposureCard({ cryptoValue, fixedIncomeValue, variableIncomeValue, realEstateValue = 0, formatCurrency: customFormat }: ExposureCardProps) {
  const total = cryptoValue + fixedIncomeValue + variableIncomeValue + realEstateValue;
  
  const formatDefault = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const format = customFormat || formatDefault;

  // Create asset distribution data
  const assets: AssetItem[] = [
    { 
      name: "Mercado Cripto", 
      value: cryptoValue, 
      percent: total > 0 ? (cryptoValue / total) * 100 : 0,
      color: "hsl(var(--chart-1))",
      icon: Bitcoin
    },
    { 
      name: "Renda Fixa", 
      value: fixedIncomeValue, 
      percent: total > 0 ? (fixedIncomeValue / total) * 100 : 0,
      color: "hsl(var(--chart-2))",
      icon: Landmark
    },
    { 
      name: "Renda Variável", 
      value: variableIncomeValue, 
      percent: total > 0 ? (variableIncomeValue / total) * 100 : 0,
      color: "hsl(var(--chart-3))",
      icon: BarChart3
    },
    { 
      name: "Imóveis", 
      value: realEstateValue, 
      percent: total > 0 ? (realEstateValue / total) * 100 : 0,
      color: "hsl(var(--chart-4))",
      icon: Building2
    },
  ].filter(item => item.value > 0);

  const pieData = assets.map(asset => ({
    name: asset.name,
    value: asset.value,
    color: asset.color
  }));

  const renderCustomLabel = ({ percent }: { percent: number }) => {
    return `${((percent * 100).toFixed(1)).replace('.', ',')}%`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const { name, value } = payload[0].payload;
      const percentage = ((value / total) * 100).toFixed(1).replace('.', ',');
      return (
        <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
          <p className="text-sm font-semibold text-foreground mb-1">{name}</p>
          <p className="text-sm text-foreground">{format(value)}</p>
          <p className="text-xs text-muted-foreground">{percentage}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Distribuição de Ativos</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pie Chart - Left Side */}
          {pieData.length > 0 && (
            <div className="flex flex-col items-center pt-8">
              <div className="h-[550px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 20, right: 60, left: 60, bottom: 100 }}>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      labelLine={false}
                      label={renderCustomLabel}
                      innerRadius={55}
                      outerRadius={110}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      verticalAlign="bottom" 
                      height={40}
                      wrapperStyle={{ paddingTop: "20px", paddingBottom: "10px" }}
                      formatter={(value) => <span className="text-xs text-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Details - Right Side */}
          <div className="space-y-4">
            {assets.map((asset, index) => {
              const Icon = asset.icon;
              const percentFormatted = asset.percent.toFixed(1).replace('.', ',');
              return (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <div 
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: `${asset.color}20` }}
                      >
                        <Icon className="h-4 w-4" style={{ color: asset.color }} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm">{asset.name}</p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {format(asset.value)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span 
                        className="text-sm font-bold tabular-nums whitespace-nowrap rounded px-2 py-1"
                        style={{ 
                          backgroundColor: `${asset.color}20`,
                          color: asset.color
                        }}
                      >
                        {percentFormatted}%
                      </span>
                    </div>
                  </div>
                  <Progress value={asset.percent} className="h-2" style={{ accentColor: asset.color }} />
                </div>
              );
            })}

            {assets.length > 0 && (
              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-medium">Total</span>
                  <span className="text-lg font-bold tabular-nums">{format(total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
