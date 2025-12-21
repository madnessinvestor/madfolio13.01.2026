import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TrendingUp, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PerformanceDataPoint {
  month: string;
  value: number;
  variation?: number;
  variationPercent?: number;
  isLocked?: boolean;
}

interface PerformanceChartProps {
  data: PerformanceDataPoint[];
  title?: string;
  monthStatus?: Record<number, boolean>;
  onViewDetails?: () => void;
  availableYears?: number[];
  selectedYear?: number;
  onYearChange?: (year: number) => void;
}

export function PerformanceChart({ data, title = "Evolução do Portfólio", monthStatus = {}, onViewDetails, availableYears = [], selectedYear, onYearChange }: PerformanceChartProps) {
  const [chartType, setChartType] = useState<"line" | "bar">("line");
  const [internalYear, setInternalYear] = useState(selectedYear || (availableYears.length > 0 ? availableYears[availableYears.length - 1] : new Date().getFullYear()));

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `R$ ${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `R$ ${(value / 1000).toFixed(0)}k`;
    return `R$ ${value.toFixed(0)}`;
  };

  const formatTooltipValue = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const handleYearChange = (year: string) => {
    const newYear = parseInt(year);
    setInternalYear(newYear);
    onYearChange?.(newYear);
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      
      return (
        <div className="bg-popover border border-border p-3 rounded-lg shadow-lg">
          <p className="font-semibold text-foreground mb-2">{label}</p>
          <p className="text-sm text-foreground mb-2">
            Portfólio: <span className="font-medium">{formatTooltipValue(dataPoint.value)}</span>
          </p>
          {dataPoint.variation !== undefined && dataPoint.variation !== 0 ? (
            <div className={`pt-2 border-t border-border mt-2 ${(dataPoint.variation ?? 0) >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
              <p className={`text-sm font-semibold ${(dataPoint.variation ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                Variação: {(dataPoint.variation ?? 0) >= 0 ? '+' : ''}{formatTooltipValue(dataPoint.variation)}
              </p>
              <p className={`text-xs font-medium ${(dataPoint.variation ?? 0) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {(dataPoint.variation ?? 0) >= 0 ? '+' : ''}{dataPoint.variationPercent?.toFixed(2)}%
              </p>
            </div>
          ) : (
            <div className="pt-2 border-t border-border mt-2">
              <p className="text-xs text-muted-foreground">Primeiro mês do período</p>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-4">
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
          {availableYears.length > 0 && (
            <Select value={internalYear.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-24" data-testid="select-year">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {onViewDetails && (
          <Button
            onClick={onViewDetails}
            variant="outline"
            size="sm"
            className="gap-2"
            data-testid="button-view-portfolio-evolution"
          >
            <TrendingUp className="h-4 w-4" />
            Ver Detalhes
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <Tabs value={chartType} onValueChange={(v) => setChartType(v as "line" | "bar")} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="line" data-testid="tab-line-chart">Linhas</TabsTrigger>
            <TabsTrigger value="bar" data-testid="tab-bar-chart">Barras</TabsTrigger>
          </TabsList>
          
          <TabsContent value="line">
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={(props: any) => {
                      const { cx, cy, payload } = props;
                      const isLocked = payload?.isLocked || false;
                      return (
                        <circle
                          key={`dot-${cx}`}
                          cx={cx}
                          cy={cy}
                          r={4}
                          fill={isLocked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                          strokeWidth={2}
                          stroke={isLocked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                        />
                      );
                    }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>

          <TabsContent value="bar">
            <div className="h-96">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
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
                  <Bar
                    dataKey="value"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    shape={(props: any) => {
                      const { x, y, width, height, payload } = props;
                      const isLocked = payload?.isLocked || false;
                      const barColor = isLocked ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))";
                      const opacity = isLocked ? 1 : 0.4;
                      return (
                        <rect key={`bar-${x}`} x={x} y={y} width={width} height={height} fill={barColor} opacity={opacity} rx={4} ry={4} />
                      );
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
