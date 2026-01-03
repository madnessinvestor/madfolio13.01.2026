import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";
import { memo } from "react";

interface CategoryData {
  name: string;
  value: number;
  color: string;
}

interface CategoryChartProps {
  title: string;
  data: CategoryData[];
  showPercentage?: boolean;
}

export const CategoryChart = memo(function CategoryChart({ title, data, showPercentage = true }: CategoryChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0);

  const formatCurrency = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const renderCustomLabel = ({ name, percent }: { name: string; percent: number }) => {
    if (percent < 0.05) return null;
    return `${(percent * 100).toFixed(0)}%`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const { name, value } = payload[0].payload;
      const percentage = ((value / total) * 100).toFixed(1);
      return (
        <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
          <p className="text-sm font-semibold text-foreground mb-1">{name}</p>
          <p className="text-sm text-foreground">{formatCurrency(value)}</p>
          <p className="text-xs text-muted-foreground">{percentage}%</p>
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
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={showPercentage ? renderCustomLabel : undefined}
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={36}
                wrapperStyle={{ paddingTop: "16px" }}
                formatter={(value) => <span className="text-sm text-foreground">{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 space-y-2">
          {data.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span>{item.name}</span>
              </div>
              <span className="tabular-nums font-medium">
                {formatCurrency(item.value)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
