import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon?: LucideIcon;
}

export function MetricCard({ title, value, change, changeLabel, icon: Icon }: MetricCardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change === undefined || change === 0;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-lg sm:text-xl lg:text-2xl font-bold tabular-nums mt-1 truncate" data-testid={`text-metric-${title.toLowerCase().replace(/\s/g, '-')}`}>
              {value}
            </p>
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-2">
                {isPositive && <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />}
                {isNegative && <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />}
                {isNeutral && <Minus className="h-4 w-4 text-muted-foreground" />}
                <span
                  className={`text-sm font-medium tabular-nums ${
                    isPositive
                      ? "text-green-600 dark:text-green-400"
                      : isNegative
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground"
                  }`}
                >
                  {isPositive ? "+" : ""}{change.toFixed(2)}%
                </span>
                {changeLabel && (
                  <span className="text-xs text-muted-foreground ml-1">{changeLabel}</span>
                )}
              </div>
            )}
          </div>
          {Icon && (
            <div className="flex-shrink-0 p-3 rounded-lg bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
