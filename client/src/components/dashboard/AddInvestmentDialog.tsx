import { useState, useEffect, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, RefreshCw, CheckCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export type AssetCategory = "crypto" | "stocks" | "fixed_income" | "cash" | "fii" | "etf" | "real_estate" | "others";
export type MarketType = "crypto" | "fixed_income" | "variable_income";

export interface Investment {
  id: string;
  name: string;
  symbol: string;
  category: AssetCategory;
  market: MarketType;
  quantity: number;
  acquisitionPrice: number;
  acquisitionDate: string;
  currentPrice?: number;
}

export interface Snapshot {
  assetId: string;
  value: number;
  date: string;
  notes?: string;
}

interface AddInvestmentDialogProps {
  onAdd: (investment: Omit<Investment, "id" | "currentPrice">) => void;
  onAddSnapshot?: (snapshot: Snapshot) => void;
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
  fixed_income: "Renda Fixa",
  variable_income: "Renda Variável",
};

const categoriesByMarket: Record<MarketType, AssetCategory[]> = {
  crypto: ["crypto"],
  fixed_income: ["fixed_income", "cash", "others"],
  variable_income: ["stocks", "fii", "etf", "others"],
};

interface ExistingAsset {
  id: string;
  symbol: string;
  name: string;
  market: string;
}

export function AddInvestmentDialog({ onAdd, onAddSnapshot, isLoading }: AddInvestmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"new" | "update">("new");
  
  // New investment form state
  const [market, setMarket] = useState<MarketType>("crypto");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [category, setCategory] = useState<AssetCategory>("crypto");
  const [quantity, setQuantity] = useState("");
  const [acquisitionPrice, setAcquisitionPrice] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState(new Date().toISOString().split("T")[0]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState(false);

  // Update value form state
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [updateValue, setUpdateValue] = useState("");
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split("T")[0]);
  const [updateNotes, setUpdateNotes] = useState("");

  // Fetch existing assets for the update tab
  const { data: existingAssets = [] } = useQuery<ExistingAsset[]>({
    queryKey: ["/api/assets"],
    enabled: open,
  });

  const fetchCurrentPrice = useCallback(async (symbolToFetch: string, marketType: MarketType) => {
    if (marketType === "fixed_income") {
      setCurrentPrice(null);
      setPriceError(false);
      return;
    }

    if (!symbolToFetch || symbolToFetch.length < 2) {
      setCurrentPrice(null);
      return;
    }

    setPriceLoading(true);
    setPriceError(false);

    try {
      const response = await fetch(`/api/price-lookup?symbol=${encodeURIComponent(symbolToFetch)}&market=${marketType}`);
      if (response.ok) {
        const data = await response.json();
        if (data.price) {
          setCurrentPrice(data.price);
        } else {
          setCurrentPrice(null);
          setPriceError(true);
        }
      } else {
        setCurrentPrice(null);
        setPriceError(true);
      }
    } catch (error) {
      setCurrentPrice(null);
      setPriceError(true);
    } finally {
      setPriceLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (symbol.length >= 2) {
        fetchCurrentPrice(symbol, market);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [symbol, market, fetchCurrentPrice]);

  const handleMarketChange = (value: MarketType) => {
    setMarket(value);
    const defaultCategory = categoriesByMarket[value][0];
    setCategory(defaultCategory);
    setCurrentPrice(null);
    if (symbol) {
      fetchCurrentPrice(symbol, value);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Para renda fixa, validação simplificada
    if (market === "fixed_income") {
      if (!name || !acquisitionPrice) return;
      const priceString = acquisitionPrice.replace(/[^\d.,]/g, "");
      const parsedPrice = parseFloat(priceString.replace(/\./g, "").replace(",", "."));
      if (isNaN(parsedPrice)) return;

      onAdd({
        name,
        symbol: name.substring(0, 10),
        category: "fixed_income",
        market,
        quantity: 1,
        acquisitionPrice: parsedPrice,
        acquisitionDate: new Date().toISOString().split("T")[0],
      });
    } else {
      // Para outros mercados, validação completa
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
        quantity: parsedQuantity,
        acquisitionPrice: parsedPrice,
        acquisitionDate,
      });
    }

    resetForm();
    setOpen(false);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssetId || !updateValue || !updateDate || !onAddSnapshot) return;

    const valueString = updateValue.replace(/[^\d.,]/g, "");
    const parsedValue = parseFloat(valueString.replace(/\./g, "").replace(",", "."));

    if (isNaN(parsedValue)) return;

    onAddSnapshot({
      assetId: selectedAssetId,
      value: parsedValue,
      date: updateDate,
      notes: updateNotes || undefined,
    });

    resetUpdateForm();
    setOpen(false);
  };

  const resetForm = () => {
    setMarket("crypto");
    setName("");
    setSymbol("");
    setCategory("crypto");
    setQuantity("");
    setAcquisitionPrice("");
    setAcquisitionDate(new Date().toISOString().split("T")[0]);
    setCurrentPrice(null);
    setPriceError(false);
  };

  const resetUpdateForm = () => {
    setSelectedAssetId("");
    setUpdateValue("");
    setUpdateDate(new Date().toISOString().split("T")[0]);
    setUpdateNotes("");
  };

  const formatCurrency = (val: string) => {
    const num = val.replace(/[^\d]/g, "");
    if (!num) return "";
    const formatted = (parseInt(num) / 100).toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `R$ ${formatted}`;
  };

  const availableCategories = categoriesByMarket[market];

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      resetForm();
      resetUpdateForm();
      setActiveTab("new");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-investment">
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Investimento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Adicionar Investimento</DialogTitle>
          <DialogDescription>
            Cadastre um novo investimento ou atualize o valor de um ativo existente.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "new" | "update")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" data-testid="tab-new-investment">Novo Investimento</TabsTrigger>
            <TabsTrigger value="update" data-testid="tab-update-value">Atualizar Valor</TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            <form onSubmit={handleSubmit}>
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

                {market === "fixed_income" ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="bank">Banco/Instituição Financeira</Label>
                      <Input
                        id="bank"
                        placeholder="Ex: Nubank, Banco do Brasil, etc"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="input-bank-name"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="value">Valor Aportado</Label>
                      <Input
                        id="value"
                        placeholder="R$ 0,00"
                        value={acquisitionPrice}
                        onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                        data-testid="input-fixed-income-value"
                      />
                    </div>

                    <p className="text-sm text-muted-foreground">
                      Os valores são armazenados em Reais (BRL).
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label htmlFor="symbol">Símbolo / Código</Label>
                        <Input
                          id="symbol"
                          placeholder={market === "crypto" ? "BTC, ETH" : "PETR4, IVVB11"}
                          value={symbol}
                          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                          data-testid="input-symbol"
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="name">Nome do Ativo</Label>
                        <Input
                          id="name"
                          placeholder={market === "crypto" ? "Bitcoin" : "Petrobras"}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          data-testid="input-name"
                        />
                      </div>
                    </div>

                    {currentPrice !== null && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                        <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-sm text-green-700 dark:text-green-300">
                          Preço atual: R$ {currentPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    )}

                    {priceLoading && (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        <span className="text-sm text-muted-foreground">Buscando preço atual...</span>
                      </div>
                    )}

                    {priceError && !priceLoading && symbol.length >= 2 && (
                      <div className="text-sm text-yellow-600 dark:text-yellow-400">
                        Preço não encontrado. O valor será atualizado após o cadastro.
                      </div>
                    )}

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
                          placeholder="R$ 0,00"
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

                    <p className="text-sm text-muted-foreground">
                      Os valores são armazenados em Reais (BRL). Você pode visualizar em outras moedas usando o seletor no canto superior direito.
                    </p>
                  </>
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
          </TabsContent>

          <TabsContent value="update">
            <form onSubmit={handleUpdateSubmit}>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="asset">Ativo</Label>
                  <Select value={selectedAssetId} onValueChange={setSelectedAssetId}>
                    <SelectTrigger data-testid="select-asset">
                      <SelectValue placeholder="Selecione o ativo" />
                    </SelectTrigger>
                    <SelectContent>
                      {existingAssets.map((asset) => (
                        <SelectItem key={asset.id} value={asset.id}>
                          {asset.symbol} - {asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {existingAssets.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nenhum ativo cadastrado. Adicione um investimento primeiro.
                  </p>
                )}

                <div className="grid gap-2">
                  <Label htmlFor="updateValue">Valor Atual</Label>
                  <Input
                    id="updateValue"
                    placeholder="R$ 0,00"
                    value={updateValue}
                    onChange={(e) => setUpdateValue(formatCurrency(e.target.value))}
                    data-testid="input-update-value"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="updateDate">Data</Label>
                  <Input
                    id="updateDate"
                    type="date"
                    value={updateDate}
                    onChange={(e) => setUpdateDate(e.target.value)}
                    data-testid="input-update-date"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="updateNotes">Observações (opcional)</Label>
                  <Input
                    id="updateNotes"
                    placeholder="Ex: Aporte mensal, rendimento"
                    value={updateNotes}
                    onChange={(e) => setUpdateNotes(e.target.value)}
                    data-testid="input-update-notes"
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Use esta opção para atualizar manualmente o valor de ativos que não possuem cotação automática (ex: Renda Fixa, Caixa).
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading || existingAssets.length === 0 || !onAddSnapshot} 
                  data-testid="button-submit-update"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    "Salvar"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
