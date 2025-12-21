import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign } from "lucide-react";

export type DisplayCurrency = "BRL" | "USD" | "EUR";

interface CurrencySwitcherProps {
  value: DisplayCurrency;
  onChange: (currency: DisplayCurrency) => void;
}

const currencyConfig: Record<DisplayCurrency, { label: string; symbol: string; flag: string }> = {
  BRL: { label: "Real", symbol: "R$", flag: "🇧🇷" },
  USD: { label: "Dólar", symbol: "$", flag: "🇺🇸" },
  EUR: { label: "Euro", symbol: "€", flag: "🇪🇺" },
};

export function CurrencySwitcher({ value, onChange }: CurrencySwitcherProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as DisplayCurrency)}>
      <SelectTrigger className="w-[100px] h-9" data-testid="currency-switcher">
        <DollarSign className="h-4 w-4 mr-1" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(currencyConfig) as DisplayCurrency[]).map((currency) => (
          <SelectItem key={currency} value={currency}>
            <span className="flex items-center gap-2">
              <span>{currencyConfig[currency].flag}</span>
              <span>{currency}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface ExchangeRates {
  USD: number;
  EUR: number;
  BRL: number;
}

export function useCurrencyConverter() {
  const { data: rates } = useQuery<ExchangeRates>({
    queryKey: ["/api/exchange-rates"],
    staleTime: 30 * 60 * 1000,
  });

  const convert = (valueInBRL: number, toCurrency: DisplayCurrency): number => {
    if (!rates || toCurrency === "BRL") return valueInBRL;
    const rate = rates[toCurrency];
    if (!rate || rate === 0) return valueInBRL;
    return valueInBRL / rate;
  };

  const formatCurrency = (valueInBRL: number, displayCurrency: DisplayCurrency): string => {
    if (typeof valueInBRL !== 'number' || isNaN(valueInBRL)) {
      valueInBRL = 0;
    }
    
    const converted = convert(valueInBRL, displayCurrency);
    const config = currencyConfig[displayCurrency];
    
    if (isNaN(converted)) {
      return `${config.symbol} 0,00`;
    }
    
    return `${config.symbol} ${converted.toLocaleString("pt-BR", { 
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    })}`;
  };

  return { convert, formatCurrency, rates };
}
