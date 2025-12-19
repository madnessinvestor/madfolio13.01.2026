import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Legend,
} from "recharts";

interface PerformanceDataPoint {
  month: string;
  value: number;
  variation?: number;
  variationPercent?: number;
}

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  title?: string;
}

export function PerformanceChart({ data, title = "Evolução do Portfólio" }: PerformanceChartProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
    return `R$ ${value.toFixed(0)}`;
  };

  const formatTooltipValue = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const isPositive = dataPoint.variation >= 0;
      
      return (
        <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold text-foreground mb-2">{label}</p>
          <p className="text-sm text-foreground mb-2">
            Portfólio: <span className="font-medium">{formatTooltipValue(dataPoint.value)}</span>
          </p>
          {dataPoint.variation !== undefined && (
            <div className={`pt-2 border-t border-border mt-2 ${isPositive ? 'border-green-500/30' : 'border-red-500/30'}`}>
              <p className={`text-sm font-semibold flex items-center gap-1 ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                Variação: {isPositive ? '+' : ''}{formatTooltipValue(dataPoint.variation)}
              </p>
              <p className={`text-xs font-medium ${isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {isPositive ? '+' : ''}{dataPoint.variationPercent?.toFixed(2)}%
              </p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-96">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                angle={-45}
                textAnchor="end"
                height={80}
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={{ fontSize: 12 }}
                className="text-muted-foreground"
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend 
                wrapperStyle={{ paddingTop: "20px" }}
                iconType="line"
              />
              <Bar
                dataKey="value"
                fill="hsl(var(--primary) / 0.3)"
                radius={[4, 4, 0, 0]}
                name="Valor do Portfólio"
              />
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
                name="Evolução"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
