import { useQuery } from "@tanstack/react-query";
import { TrendingUp } from "lucide-react";

interface ExchangeRates {
  USD: number;
  EUR: number;
  BRL: number;
}

interface CryptoPrice {
  bitcoin?: { brl: number };
  ethereum?: { brl: number };
}

export function LiveRates() {
  // Fetch exchange rates (USD, EUR)
  const { data: exchangeRates } = useQuery<ExchangeRates>({
    queryKey: ["/api/exchange-rates"],
    refetchInterval: 10 * 60 * 1000, // 10 minutos
    staleTime: 10 * 60 * 1000,
  });

  // Fetch crypto prices (BTC, ETH)
  const { data: cryptoPrices } = useQuery<CryptoPrice>({
    queryKey: ["crypto-prices"],
    queryFn: async () => {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=brl"
      );
      if (!response.ok) throw new Error("Failed to fetch crypto prices");
      return response.json();
    },
    refetchInterval: 10 * 60 * 1000, // 10 minutos
    staleTime: 10 * 60 * 1000,
  });

  const formatRate = (
    value: number | undefined,
    decimals: number = 2
  ): string => {
    if (!value) return "...";
    return `R$ ${value.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}`;
  };

  const usdRate = exchangeRates?.USD;
  const eurRate = exchangeRates?.EUR;
  const btcRate = cryptoPrices?.bitcoin?.brl;
  const ethRate = cryptoPrices?.ethereum?.brl;

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground border-l pl-3">
      <TrendingUp className="h-4 w-4" />
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          <span>💵</span>
          <span className="font-medium">USD:</span>
          <span>{formatRate(usdRate)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>💶</span>
          <span className="font-medium">EUR:</span>
          <span>{formatRate(eurRate)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>₿</span>
          <span className="font-medium">BTC:</span>
          <span>{formatRate(btcRate, 0)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span>Ξ</span>
          <span className="font-medium">ETH:</span>
          <span>{formatRate(ethRate, 0)}</span>
        </div>
      </div>
    </div>
  );
}
