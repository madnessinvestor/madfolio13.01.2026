import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Landmark, BarChart3 } from "lucide-react";

interface IncomeExposureCardProps {
  fixedIncomeValue: number;
  variableIncomeValue: number;
  formatCurrency?: (value: number) => string;
}

export function IncomeExposureCard({ fixedIncomeValue, variableIncomeValue, formatCurrency: customFormat }: IncomeExposureCardProps) {
  const total = fixedIncomeValue + variableIncomeValue;
  const fixedPercent = total > 0 ? (fixedIncomeValue / total) * 100 : 0;
  const variablePercent = total > 0 ? (variableIncomeValue / total) * 100 : 0;

  const formatDefault = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const format = customFormat || formatDefault;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Exposição Renda</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
              {fixedPercent.toFixed(1)}%
            </span>
          </div>
          <Progress value={fixedPercent} className="h-2" />
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
              {variablePercent.toFixed(1)}%
            </span>
          </div>
          <Progress value={variablePercent} className="h-2" />
        </div>

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-xl font-bold tabular-nums">{format(total)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
