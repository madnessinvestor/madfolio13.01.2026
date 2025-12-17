import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Bitcoin, Landmark, Building2 } from "lucide-react";

interface ExposureCardProps {
  cryptoValue: number;
  traditionalValue: number;
  realEstateValue?: number;
  formatCurrency?: (value: number) => string;
}

export function ExposureCard({ cryptoValue, traditionalValue, realEstateValue = 0, formatCurrency: customFormat }: ExposureCardProps) {
  const total = cryptoValue + traditionalValue + realEstateValue;
  const cryptoPercent = total > 0 ? (cryptoValue / total) * 100 : 0;
  const traditionalPercent = total > 0 ? (traditionalValue / total) * 100 : 0;
  const realEstatePercent = total > 0 ? (realEstateValue / total) * 100 : 0;

  const formatDefault = (value: number) =>
    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  const format = customFormat || formatDefault;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold">Exposição por Mercado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
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
                <p className="font-medium text-sm">Mercado Tradicional</p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {format(traditionalValue)}
                </p>
              </div>
            </div>
            <span className="text-lg font-bold tabular-nums">
              {traditionalPercent.toFixed(1)}%
            </span>
          </div>
          <Progress value={traditionalPercent} className="h-2" />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-chart-3/10">
                <Building2 className="h-4 w-4 text-chart-3" />
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
      </CardContent>
    </Card>
  );
}
