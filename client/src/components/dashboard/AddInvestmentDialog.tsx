import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";

export type AssetCategory = "crypto" | "stocks" | "fixed_income" | "cash" | "fii" | "etf" | "real_estate" | "others";
export type MarketType = "crypto" | "traditional" | "real_estate";
export type CurrencyType = "BRL" | "USD" | "EUR";

export interface Investment {
  id: string;
  name: string;
  symbol: string;
  category: AssetCategory;
  market: MarketType;
  currency: CurrencyType;
  quantity: number;
  acquisitionPrice: number;
  acquisitionDate: string;
  currentPrice?: number;
}

interface AddInvestmentDialogProps {
  onAdd: (investment: Omit<Investment, "id" | "currentPrice">) => void;
  isLoading?: boolean;
}

const categoryLabels: Record<AssetCategory, string> = {
  crypto: "Criptomoeda",
  stocks: "Ações",
  fixed_income: "Renda Fixa",
  cash: "Caixa",
  fii: "Fundos Imobiliários",
  etf: "ETF",
  real_estate: "Imóveis",
  others: "Outros",
};

const marketLabels: Record<MarketType, string> = {
  crypto: "Mercado Cripto",
  traditional: "Mercado Tradicional",
  real_estate: "Imóveis",
};

const currencyLabels: Record<CurrencyType, string> = {
  BRL: "R$ Real",
  USD: "$ Dólar",
  EUR: "€ Euro",
};

const currencySymbols: Record<CurrencyType, string> = {
  BRL: "R$",
  USD: "$",
  EUR: "€",
};

const categoriesByMarket: Record<MarketType, AssetCategory[]> = {
  crypto: ["crypto"],
  traditional: ["stocks", "fixed_income", "cash", "fii", "etf", "others"],
  real_estate: ["real_estate"],
};

export function AddInvestmentDialog({ onAdd, isLoading }: AddInvestmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [market, setMarket] = useState<MarketType>("crypto");
  const [currency, setCurrency] = useState<CurrencyType>("BRL");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [category, setCategory] = useState<AssetCategory>("crypto");
  const [quantity, setQuantity] = useState("");
  const [acquisitionPrice, setAcquisitionPrice] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split("T")[0]);

  const handleMarketChange = (value: MarketType) => {
    setMarket(value);
    const defaultCategory = categoriesByMarket[value][0];
    setCategory(defaultCategory);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !symbol || !quantity || !acquisitionPrice || !acquisitionDate) return;

    const parsedQuantity = parseFloat(quantity.replace(",", "."));
    const priceString = acquisitionPrice.replace(/[^\d.,]/g, "");
    const parsedPrice = parseFloat(priceString.replace(/\./g, "").replace(",", "."));

    if (isNaN(parsedQuantity) || isNaN(parsedPrice)) return;

    onAdd({
      name,
      symbol: symbol.toUpperCase(),
      category,
      market,
      currency,
      quantity: parsedQuantity,
      acquisitionPrice: parsedPrice,
      acquisitionDate,
    });

    resetForm();
    setOpen(false);
  };

  const resetForm = () => {
    setMarket("crypto");
    setCurrency("BRL");
    setName("");
    setSymbol("");
    setCategory("crypto");
    setQuantity("");
    setAcquisitionPrice("");
    setAcquisitionDate(new Date().toISOString().split("T")[0]);
  };

  const formatCurrency = (val: string) => {
    const num = val.replace(/[^\d]/g, "");
    if (!num) return "";
    const formatted = (parseInt(num) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${currencySymbols[currency]} ${formatted}`;
  };

  const availableCategories = categoriesByMarket[market];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-investment">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Investimento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Adicionar Investimento</DialogTitle>
            <DialogDescription>
              Cadastre um novo investimento. O preço atual será buscado automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="market">Tipo de Mercado</Label>
              <Select value={market} onValueChange={handleMarketChange}>
                <SelectTrigger data-testid="select-market">
                  <SelectValue placeholder="Selecione o mercado" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(marketLabels) as MarketType[]).map((m) => (
                    <SelectItem key={m} value={m}>
                      {marketLabels[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="symbol">Símbolo / Código</Label>
                <Input
                  id="symbol"
                  placeholder={market === "crypto" ? "BTC, ETH" : market === "real_estate" ? "APT01" : "PETR4, IVVB11"}
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  data-testid="input-symbol"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name">Nome do Ativo</Label>
                <Input
                  id="name"
                  placeholder={market === "crypto" ? "Bitcoin" : market === "real_estate" ? "Apartamento SP" : "Petrobras"}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-name"
                />
              </div>
            </div>

            {availableCategories.length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="category">Categoria</Label>
                <Select value={category} onValueChange={(value: AssetCategory) => setCategory(value)}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {categoryLabels[cat]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="currency">Moeda</Label>
              <Select value={currency} onValueChange={(value: CurrencyType) => {
                setCurrency(value);
                setAcquisitionPrice("");
              }}>
                <SelectTrigger data-testid="select-currency">
                  <SelectValue placeholder="Selecione a moeda" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(currencyLabels) as CurrencyType[]).map((c) => (
                    <SelectItem key={c} value={c}>
                      {currencyLabels[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quantity">Quantidade</Label>
                <Input
                  id="quantity"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.5"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  data-testid="input-quantity"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="acquisitionPrice">Preço de Aquisição</Label>
                <Input
                  id="acquisitionPrice"
                  placeholder={`${currencySymbols[currency]} 0,00`}
                  value={acquisitionPrice}
                  onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                  data-testid="input-acquisition-price"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="acquisitionDate">Data da Aquisição</Label>
              <Input
                id="acquisitionDate"
                type="date"
                value={acquisitionDate}
                onChange={(e) => setAcquisitionDate(e.target.value)}
                data-testid="input-acquisition-date"
              />
            </div>

            {market !== "real_estate" && (
              <p className="text-sm text-muted-foreground">
                O preço atual será buscado automaticamente após o cadastro.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading} data-testid="button-submit-investment">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                "Adicionar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
