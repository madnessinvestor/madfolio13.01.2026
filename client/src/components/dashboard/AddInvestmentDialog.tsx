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
import { Plus, Loader2, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface WalletBalance {
  id?: string;
  name: string;
  link: string;
  balance: string;
  lastUpdated: string;
  error?: string;
  status?: 'success' | 'temporary_error' | 'unavailable';
  lastKnownValue?: string;
}

export type AssetCategory = "crypto" | "stocks" | "fixed_income" | "cash" | "fii" | "etf" | "real_estate" | "others";
export type MarketType = "crypto" | "crypto_simplified" | "fixed_income" | "variable_income" | "variable_income_simplified";

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
  onEdit?: (id: string, investment: Omit<Investment, "id" | "currentPrice">) => void;
  isLoading?: boolean;
  initialEditAssetId?: string;
  existingAssets?: ExistingAsset[];
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
  crypto_simplified: "Mercado Cripto (Simplificado)",
  fixed_income: "Renda Fixa",
  variable_income: "Renda Variável",
  variable_income_simplified: "Renda Variável (Simplificado)",
};

const categoriesByMarket: Record<MarketType, AssetCategory[]> = {
  crypto: ["crypto"],
  crypto_simplified: ["crypto"],
  fixed_income: ["fixed_income", "cash", "others"],
  variable_income: ["stocks", "fii", "etf", "others"],
  variable_income_simplified: ["stocks", "others"],
};

interface ExistingAsset {
  id: string;
  symbol: string;
  name: string;
  market: string;
  category?: string;
  quantity?: number;
  acquisitionPrice?: number;
  acquisitionDate?: string;
}

export function AddInvestmentDialog({ onAdd, isLoading, existingAssets: providedAssets }: AddInvestmentDialogProps) {
  const [open, setOpen] = useState(false);
  
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
  const [cryptoValueUSD, setCryptoValueUSD] = useState("");
  const [cryptoValueBRL, setCryptoValueBRL] = useState("");
  const [walletName, setWalletName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLink, setWalletLink] = useState("");
  const [network, setNetwork] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [investmentType, setInvestmentType] = useState<string>("outros");

  // Fetch existing assets
  const { data: fetchedAssets = [] } = useQuery<ExistingAsset[]>({
    queryKey: ["/api/assets"],
    enabled: open && !providedAssets,
  });

  // Fetch exchange rates for crypto simplified
  const { data: exchangeRates = { USD: 5.51 } } = useQuery<Record<string, number>>({
    queryKey: ["/api/exchange-rates"],
    enabled: open && market === "crypto_simplified",
  });

  // Fetch DeBank wallets
  const { data: debankWallets = [] } = useQuery<WalletBalance[]>({
    queryKey: ["/api/saldo/detailed"],
    enabled: open && market === "crypto_simplified",
  });
  
  const existingAssets = providedAssets || fetchedAssets;

  const fetchCurrentPrice = useCallback(async (symbolToFetch: string, marketType: MarketType) => {
    if (marketType === "fixed_income" || marketType === "crypto_simplified") {
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
    
    if (market === "crypto_simplified") {
      if (!walletName || !cryptoValueBRL) return;
      const priceString = cryptoValueBRL.replace(/[^\d.,]/g, "");
      const parsedPrice = parseFloat(priceString.replace(/\./g, "").replace(",", "."));
      if (isNaN(parsedPrice)) return;

      onAdd({
        name: walletName,
        symbol: walletName.substring(0, 20).toUpperCase(),
        category: "crypto",
        market: "crypto_simplified",
        quantity: 1,
        acquisitionPrice: parsedPrice,
        acquisitionDate: new Date().toISOString().split("T")[0],
      });
    } else if (market === "fixed_income" || market === "variable_income_simplified") {
      if (!name || !acquisitionPrice) return;
      const priceString = acquisitionPrice.replace(/[^\d.,]/g, "");
      const parsedPrice = parseFloat(priceString.replace(/\./g, "").replace(",", "."));
      if (isNaN(parsedPrice)) return;

      let marketType: MarketType = "crypto";
      let categoryType: AssetCategory = "crypto";

      if (market === "fixed_income") {
        marketType = "fixed_income";
        categoryType = "fixed_income";
      } else if (market === "variable_income_simplified") {
        marketType = "variable_income_simplified";
        categoryType = "stocks";
      }

      onAdd({
        name,
        symbol: name.substring(0, 10),
        category: categoryType,
        market: marketType,
        quantity: 1,
        acquisitionPrice: parsedPrice,
        acquisitionDate: new Date().toISOString().split("T")[0],
      });
    } else {
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
    setCryptoValueUSD("");
    setCryptoValueBRL("");
    setWalletName("");
    setWalletAddress("");
    setWalletLink("");
    setNetwork("");
    setWalletLoading(false);
    setInvestmentType("outros");
  };

  const parseWalletAddressFromLink = (link: string): { address: string | null; isDeBank: boolean; isPlatform: string } => {
    try {
      const url = new URL(link);
      const hostname = url.hostname.toLowerCase();
      
      if (hostname.includes("jup.ag")) {
        const portfolioMatch = url.pathname.match(/\/portfolio\/([a-zA-Z0-9]+)/);
        if (portfolioMatch) {
          return { address: portfolioMatch[1], isDeBank: false, isPlatform: "jup" };
        }
      }
      
      if (hostname.includes("debank")) {
        const addressMatch = url.pathname.match(/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: true, isPlatform: "debank" };
      }
      
      if (hostname.includes("etherscan") || hostname.includes("ethers") || hostname.includes("blockscan")) {
        const addressMatch = url.pathname.match(/address\/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: false, isPlatform: "etherscan" };
      }
      
      if (hostname.includes("blockscout")) {
        const addressMatch = url.pathname.match(/address\/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: false, isPlatform: "blockscout" };
      }
      
      if (hostname.includes("polygonscan") || hostname.includes("arbiscan") || hostname.includes("optimistic")) {
        const addressMatch = url.pathname.match(/address\/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: false, isPlatform: "explorer" };
      }
      
      const pathMatch = url.pathname.match(/(0x[a-fA-F0-9]{40})/);
      if (pathMatch) return { address: pathMatch[1], isDeBank: false, isPlatform: "explorer" };
      
      const addressParam = url.searchParams.get("address") || url.searchParams.get("a");
      if (addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam)) return { address: addressParam, isDeBank: false, isPlatform: "explorer" };
    } catch (error) {
      console.error("Error parsing wallet link:", error);
    }
    return { address: null, isDeBank: false, isPlatform: "" };
  };

  const fetchWalletBalanceData = async (address: string, isDeBank: boolean = false, platform: string = "") => {
    if (platform === "jup") {
      // Fetch from Jup.Ag
      setWalletLoading(true);
      try {
        const response = await fetch(`/api/jup-portfolio?address=${address}`);
        if (response.ok) {
          const data = await response.json();
          setCryptoValueUSD(data.netWorthUSD?.toFixed(2) || "0");
          const brlValue = (data.netWorthUSD || 0) * (exchangeRates.USD || 5.51);
          setCryptoValueBRL(brlValue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        }
      } catch (error) {
        console.error("Error fetching Jup.Ag portfolio:", error);
      } finally {
        setWalletLoading(false);
      }
      return;
    }

    if (!address.startsWith("0x") || address.length !== 42) return;
    
    setWalletLoading(true);
    try {
      const endpoint = isDeBank ? `/api/debank-balance?address=${address}` : `/api/wallet-balance?address=${address}`;
      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        setCryptoValueUSD(data.balanceUSD.toFixed(2));
        setCryptoValueBRL(data.balanceBRL.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    } catch (error) {
      console.error("Error fetching wallet balance:", error);
    } finally {
      setWalletLoading(false);
    }
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
            Cadastre um novo investimento no seu portfólio.
          </DialogDescription>
        </DialogHeader>

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

            {market === "crypto_simplified" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="wallet-select">Selecionar Wallet</Label>
                  <Select value={walletName} onValueChange={(value) => {
                    const selectedWallet = debankWallets.find(w => w.name === value);
                    if (selectedWallet) {
                      setWalletName(selectedWallet.name);
                      setWalletAddress(selectedWallet.name);
                      const balanceValue = selectedWallet.balance.replace(/[$,\s]/g, '');
                      setCryptoValueUSD(balanceValue);
                      
                      const parsedUSD = parseFloat(balanceValue);
                      if (!isNaN(parsedUSD)) {
                        const brlValue = parsedUSD * exchangeRates.USD;
                        const formatted = (brlValue).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                        setCryptoValueBRL(`${formatted}`);
                      }
                    }
                  }}>
                    <SelectTrigger data-testid="select-wallet-debank">
                      <SelectValue placeholder="Selecione uma wallet" />
                    </SelectTrigger>
                    <SelectContent>
                      {debankWallets.map((wallet) => (
                        <SelectItem key={wallet.name} value={wallet.name}>
                          <div className="flex items-center gap-2">
                            <Wallet className="h-4 w-4" />
                            {wallet.name} - {wallet.balance}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {debankWallets.length === 0 && (
                    <p className="text-xs text-muted-foreground">Carregando wallets...</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="wallet-name">Nome do Asset</Label>
                  <Input
                    id="wallet-name"
                    placeholder="Ex: Carteira Principal, Coinbase, etc"
                    value={walletName}
                    onChange={(e) => setWalletName(e.target.value)}
                    data-testid="input-wallet-name"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="wallet-link">Link da Wallet (opcional)</Label>
                  <Input
                    id="wallet-link"
                    placeholder="Ex: https://jup.ag/portfolio/..."
                    value={walletLink}
                    onChange={(e) => {
                      setWalletLink(e.target.value);
                      const { address, isPlatform } = parseWalletAddressFromLink(e.target.value);
                      if (address) {
                        setWalletName(`Wallet ${address.substring(0, 6)}`);
                        fetchWalletBalanceData(address, false, isPlatform);
                      }
                    }}
                    data-testid="input-wallet-link"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="network">Rede (opcional)</Label>
                  <Input
                    id="network"
                    placeholder="Ex: Bitcoin, Ethereum, Polygon, etc"
                    value={network}
                    onChange={(e) => setNetwork(e.target.value)}
                    data-testid="input-network"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="crypto-value-usd">Valor Total (Dólares)</Label>
                  <Input
                    id="crypto-value-usd"
                    placeholder="USD 0,00"
                    value={cryptoValueUSD}
                    onChange={(e) => {
                      const usdValue = e.target.value.replace(/[^\d.,]/g, "");
                      setCryptoValueUSD(usdValue);
                      
                      if (usdValue) {
                        const parsedUSD = parseFloat(usdValue.replace(/\./g, "").replace(",", "."));
                        if (!isNaN(parsedUSD)) {
                          const brlValue = parsedUSD * exchangeRates.USD;
                          const formatted = (brlValue).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          });
                          setCryptoValueBRL(`${formatted}`);
                        }
                      } else {
                        setCryptoValueBRL("");
                      }
                    }}
                    disabled={walletLoading}
                    data-testid="input-crypto-value-usd"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="crypto-value-brl">Valor Total (Reais)</Label>
                  <Input
                    id="crypto-value-brl"
                    placeholder="R$ 0,00"
                    value={cryptoValueBRL}
                    onChange={(e) => setCryptoValueBRL(e.target.value)}
                    disabled
                    data-testid="input-crypto-value-brl"
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Cotação USD: R$ {exchangeRates.USD?.toFixed(2) || "5.51"}. Os valores são armazenados em Reais (BRL).
                </p>
              </>
            ) : market === "fixed_income" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="bank">Banco/Instituição Financeira</Label>
                  <Input
                    id="bank"
                    placeholder="Ex: Nubank, Banco do Brasil, etc"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-bank"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="investment-type">Tipo de Investimento</Label>
                  <Select value={investmentType} onValueChange={(value) => setInvestmentType(value)}>
                    <SelectTrigger data-testid="select-investment-type">
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="caixinha-nubank">Caixinha Nubank</SelectItem>
                      <SelectItem value="poupanca">Poupança</SelectItem>
                      <SelectItem value="cdb-lci-lca">CDB | LCI | LCA | CRI | CRA</SelectItem>
                      <SelectItem value="debentures">Debêntures</SelectItem>
                      <SelectItem value="conta-rentavel">Conta Rentável</SelectItem>
                      <SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="investment-value">Valor Aplicado</Label>
                  <Input
                    id="investment-value"
                    placeholder="R$ 0,00"
                    value={acquisitionPrice}
                    onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                    data-testid="input-investment-value"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="investment-date">Data de Investimento *</Label>
                  <Input
                    id="investment-date"
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    data-testid="input-investment-date"
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Registre o valor inicial investido em renda fixa com a data do investimento.
                </p>
              </>
            ) : market === "variable_income_simplified" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="stock-name">Ativo (Ação/FII)</Label>
                  <Input
                    id="stock-name"
                    placeholder="Ex: Meu Portfólio de Ações"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-stock-name"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="stock-value">Valor Aplicado</Label>
                  <Input
                    id="stock-value"
                    placeholder="R$ 0,00"
                    value={acquisitionPrice}
                    onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                    data-testid="input-stock-value"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="stock-date">Data de Investimento *</Label>
                  <Input
                    id="stock-date"
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    data-testid="input-stock-date"
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Registre o valor aplicado no portfólio em renda variável com a data do investimento.
                </p>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="name">Nome do Ativo</Label>
                  <Input
                    id="name"
                    placeholder="Ex: Bitcoin"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="input-name"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="symbol">Símbolo</Label>
                  <Input
                    id="symbol"
                    placeholder="Ex: BTC, ETH"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    data-testid="input-symbol"
                  />
                  {priceLoading && <p className="text-sm text-muted-foreground">Buscando preço...</p>}
                  {priceError && <p className="text-sm text-red-500">Preço não encontrado</p>}
                  {currentPrice !== null && (
                    <p className="text-sm text-green-600">Preço atual: R$ {currentPrice.toFixed(2)}</p>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="category">Categoria</Label>
                  <Select value={category} onValueChange={(value) => setCategory(value as AssetCategory)}>
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

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="quantity">Quantidade</Label>
                    <Input
                      id="quantity"
                      type="text"
                      placeholder="0.00"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      data-testid="input-quantity"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="price">Preço de Aquisição</Label>
                    <Input
                      id="price"
                      placeholder="R$ 0,00"
                      value={acquisitionPrice}
                      onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                      data-testid="input-price"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="date">Data de Aquisição</Label>
                  <Input
                    id="date"
                    type="date"
                    value={acquisitionDate}
                    onChange={(e) => setAcquisitionDate(e.target.value)}
                    data-testid="input-date"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isLoading || walletLoading} data-testid="button-submit">
              {isLoading || walletLoading ? (
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
