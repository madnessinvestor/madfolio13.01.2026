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
import { Plus, Loader2, RefreshCw, CheckCircle, Wallet } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

interface WalletBalance {
  name: string;
  address: string;
  balance: string;
  lastUpdated: string;
  error?: string;
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

const investmentTypeLabels: Record<string, string> = {
  renda_fixa: "Renda Fixa",
  tesouro: "Tesouro",
  caixinha: "Caixinha",
  poupanca: "Poupança",
  outros: "Outros",
  bolsa_valores: "Bolsa de Valores",
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

export function AddInvestmentDialog({ onAdd, onAddSnapshot, onEdit, isLoading, initialEditAssetId, existingAssets: providedAssets }: AddInvestmentDialogProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"new" | "update">(initialEditAssetId ? "update" : "new");
  
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
  const [investmentType, setInvestmentType] = useState("renda_fixa");
  const [variableIncomeType, setVariableIncomeType] = useState("bolsa_valores");
  const [cryptoValueUSD, setCryptoValueUSD] = useState("");
  const [cryptoValueBRL, setCryptoValueBRL] = useState("");
  const [walletName, setWalletName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLink, setWalletLink] = useState("");
  const [network, setNetwork] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [refreshIntervalId, setRefreshIntervalId] = useState<NodeJS.Timeout | null>(null);

  // Update value form state
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [updateValue, setUpdateValue] = useState("");
  const [updateDate, setUpdateDate] = useState(new Date().toISOString().split("T")[0]);
  const [updateNotes, setUpdateNotes] = useState("");
  const [selectedAssetMarket, setSelectedAssetMarket] = useState<MarketType | "">("");

  // Fetch existing assets for the update tab (or use provided assets)
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
  
  // Set selected asset if initialEditAssetId is provided
  useEffect(() => {
    if (initialEditAssetId && existingAssets.length > 0) {
      setSelectedAssetId(initialEditAssetId);
      setUpdateValue("");
      setUpdateDate(new Date().toISOString().split("T")[0]);
      setUpdateNotes("");
    }
  }, [initialEditAssetId, existingAssets]);

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
    
    // Para cripto simplificado, renda fixa ou renda variável simplificada, validação simplificada
    if (market === "crypto_simplified") {
      if (!walletName || !cryptoValueBRL) return;
      const priceString = cryptoValueBRL.replace(/[^\d.,]/g, "");
      const parsedPrice = parseFloat(priceString.replace(/\./g, "").replace(",", "."));
      if (isNaN(parsedPrice)) return;

      onAdd({
        name: walletName,
        symbol: walletName.substring(0, 20).toUpperCase(),
        category: "crypto",
        market: "crypto",
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
        marketType = "variable_income";
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
    if (!selectedAssetId) return;

    // If using snapshot mode (legacy) - just add snapshot
    if (updateValue && updateDate && onAddSnapshot && !onEdit) {
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
      return;
    }

    // Edit mode - update full investment details
    if (onEdit && name && acquisitionPrice && market) {
      const priceString = acquisitionPrice.replace(/[^\d.,]/g, "");
      const parsedPrice = parseFloat(priceString.replace(/\./g, "").replace(",", "."));
      if (isNaN(parsedPrice)) return;

      onEdit(selectedAssetId, {
        name,
        symbol: symbol || name.substring(0, 10),
        category,
        market,
        quantity: parseFloat(quantity) || 1,
        acquisitionPrice: parsedPrice,
        acquisitionDate,
      });

      resetForm();
      resetUpdateForm();
      setOpen(false);
    }
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
    setInvestmentType("renda_fixa");
    setVariableIncomeType("bolsa_valores");
    setCryptoValueUSD("");
    setCryptoValueBRL("");
    setWalletName("");
    setWalletAddress("");
    setWalletLink("");
    setNetwork("");
    setWalletLoading(false);
  };

  const parseWalletAddressFromLink = (link: string): { address: string | null; isDeBank: boolean } => {
    try {
      const url = new URL(link);
      const hostname = url.hostname.toLowerCase();
      
      // DeBankAPI
      if (hostname.includes("debank")) {
        const addressMatch = url.pathname.match(/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: true };
      }
      
      // Etherscan variants
      if (hostname.includes("etherscan") || hostname.includes("ethers") || hostname.includes("blockscan")) {
        const addressMatch = url.pathname.match(/address\/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: false };
      }
      
      // BlockScout
      if (hostname.includes("blockscout")) {
        const addressMatch = url.pathname.match(/address\/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: false };
      }
      
      // Polygon, Arbitrum, Optimism explorers
      if (hostname.includes("polygonscan") || hostname.includes("arbiscan") || hostname.includes("optimistic")) {
        const addressMatch = url.pathname.match(/address\/(0x[a-fA-F0-9]{40})/);
        if (addressMatch) return { address: addressMatch[1], isDeBank: false };
      }
      
      // Direct address in URL path
      const pathMatch = url.pathname.match(/(0x[a-fA-F0-9]{40})/);
      if (pathMatch) return { address: pathMatch[1], isDeBank: false };
      
      // Search in URL parameters
      const addressParam = url.searchParams.get("address") || url.searchParams.get("a");
      if (addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam)) return { address: addressParam, isDeBank: false };
    } catch (error) {
      console.error("Error parsing wallet link:", error);
    }
    return { address: null, isDeBank: false };
  };

  const fetchWalletBalanceData = async (address: string, isDeBank: boolean = false) => {
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

  const resetUpdateForm = () => {
    setSelectedAssetId("");
    setUpdateValue("");
    setUpdateDate(new Date().toISOString().split("T")[0]);
    setUpdateNotes("");
    setSelectedAssetMarket("");
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
      if (refreshIntervalId) clearInterval(refreshIntervalId);
      setRefreshIntervalId(null);
      resetForm();
      resetUpdateForm();
      setActiveTab(initialEditAssetId ? "update" : "new");
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

                {market === "crypto_simplified" ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="wallet-select">Selecionar Wallet do DeBank</Label>
                      <Select value={walletAddress} onValueChange={(value) => {
                        setWalletAddress(value);
                        const selectedWallet = debankWallets.find(w => w.address === value);
                        if (selectedWallet) {
                          setWalletName(selectedWallet.name);
                          // Extract USD value from balance string (e.g., "$1,234.56" -> "1234.56")
                          const balanceValue = selectedWallet.balance.replace(/[$,]/g, '');
                          setCryptoValueUSD(balanceValue);
                          
                          // Convert USD to BRL
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
                            <SelectItem key={wallet.address} value={wallet.address}>
                              <div className="flex items-center gap-2">
                                <Wallet className="h-4 w-4" />
                                {wallet.name} - {wallet.balance}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {debankWallets.length === 0 && (
                        <p className="text-xs text-muted-foreground">Carregando wallets do DeBank...</p>
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
                      <Label htmlFor="network">Rede</Label>
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
                        data-testid="input-bank-name"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="investmentType">Tipo de Investimento</Label>
                      <Select value={investmentType} onValueChange={setInvestmentType}>
                        <SelectTrigger data-testid="select-investment-type">
                          <SelectValue placeholder="Selecione o tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(investmentTypeLabels).filter(([key]) => key !== "bolsa_valores").map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                ) : market === "variable_income_simplified" ? (
                  <>
                    <div className="grid gap-2">
                      <Label htmlFor="bank-variable">Banco/Instituição Financeira</Label>
                      <Input
                        id="bank-variable"
                        placeholder="Ex: Nubank, Banco do Brasil, etc"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        data-testid="input-bank-name-variable"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="investmentTypeVariable">Tipo de Investimento</Label>
                      <Select value={variableIncomeType} onValueChange={setVariableIncomeType} disabled>
                        <SelectTrigger data-testid="select-investment-type-variable">
                          <SelectValue placeholder="Bolsa de Valores" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bolsa_valores">Bolsa de Valores</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="value-variable">Valor Aportado</Label>
                      <Input
                        id="value-variable"
                        placeholder="R$ 0,00"
                        value={acquisitionPrice}
                        onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                        data-testid="input-variable-income-value"
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
                  <Select value={selectedAssetId} onValueChange={(value) => {
                    setSelectedAssetId(value);
                    const asset = existingAssets.find(a => a.id === value);
                    if (asset) {
                      setSelectedAssetMarket((asset.market as MarketType) || "");
                      if (onEdit) {
                        setName(asset.name);
                        setSymbol(asset.symbol);
                        setMarket((asset.market as MarketType) || "crypto");
                        setCategory((asset.category as AssetCategory) || "crypto");
                        setQuantity(asset.quantity !== undefined ? asset.quantity.toString() : "1");
                        const priceValue = asset.acquisitionPrice !== undefined ? asset.acquisitionPrice : 0;
                        const formatted = priceValue.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        });
                        setAcquisitionPrice(`R$ ${formatted}`);
                        setAcquisitionDate(asset.acquisitionDate || new Date().toISOString().split("T")[0]);
                      }
                    }
                  }}>
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

                {selectedAssetMarket && (
                  <>
                    {onEdit ? (
                      <>
                        <p className="text-sm text-muted-foreground mb-4 font-semibold">Editando: {name}</p>
                        
                        <div className="grid gap-2">
                          <Label htmlFor="edit-name">Nome do Ativo</Label>
                          <Input
                            id="edit-name"
                            placeholder="Ex: Minha Carteira Cripto"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            data-testid="input-edit-name"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="edit-symbol">Símbolo</Label>
                          <Input
                            id="edit-symbol"
                            placeholder="Ex: CRIPTO"
                            value={symbol}
                            onChange={(e) => setSymbol(e.target.value)}
                            data-testid="input-edit-symbol"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="grid gap-2">
                            <Label htmlFor="edit-quantity">Quantidade</Label>
                            <Input
                              id="edit-quantity"
                              type="text"
                              placeholder="1"
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value)}
                              data-testid="input-edit-quantity"
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="edit-price">Preço de Aquisição</Label>
                            <Input
                              id="edit-price"
                              placeholder="R$ 0,00"
                              value={acquisitionPrice}
                              onChange={(e) => setAcquisitionPrice(formatCurrency(e.target.value))}
                              data-testid="input-edit-price"
                            />
                          </div>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="edit-date">Data de Aquisição</Label>
                          <Input
                            id="edit-date"
                            type="date"
                            value={acquisitionDate}
                            onChange={(e) => setAcquisitionDate(e.target.value)}
                            data-testid="input-edit-date"
                          />
                        </div>

                        <p className="text-sm text-muted-foreground">
                          Edite os dados completos do investimento.
                        </p>
                      </>
                    ) : selectedAssetMarket === "crypto" || selectedAssetMarket === "crypto_simplified" ? (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="updateValue">Valor Total (Reais)</Label>
                          <Input
                            id="updateValue"
                            placeholder="R$ 0,00"
                            value={updateValue}
                            onChange={(e) => setUpdateValue(formatCurrency(e.target.value))}
                            data-testid="input-update-value"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="updateDate">Data da Atualização (opcional)</Label>
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
                            placeholder="Ex: Atualização de saldo"
                            value={updateNotes}
                            onChange={(e) => setUpdateNotes(e.target.value)}
                            data-testid="input-update-notes"
                          />
                        </div>

                        <p className="text-sm text-muted-foreground">
                          Atualize o valor total em Reais da sua carteira cripto.
                        </p>
                      </>
                    ) : selectedAssetMarket === "fixed_income" ? (
                      <>
                        <div className="grid gap-2">
                          <Label htmlFor="updateValue">Valor Aportado</Label>
                          <Input
                            id="updateValue"
                            placeholder="R$ 0,00"
                            value={updateValue}
                            onChange={(e) => setUpdateValue(formatCurrency(e.target.value))}
                            data-testid="input-update-value"
                          />
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="updateDate">Data do Aporte *</Label>
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
                            placeholder="Ex: Aporte mensal, tipo de investimento"
                            value={updateNotes}
                            onChange={(e) => setUpdateNotes(e.target.value)}
                            data-testid="input-update-notes"
                          />
                        </div>

                        <p className="text-sm text-muted-foreground">
                          Registre o valor aportado em renda fixa com a data do aporte.
                        </p>
                      </>
                    ) : selectedAssetMarket === "variable_income" || selectedAssetMarket === "variable_income_simplified" ? (
                      <>
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
                          <Label htmlFor="updateDate">Data da Cotação *</Label>
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
                            placeholder="Ex: Preço de fechamento, observações do dia"
                            value={updateNotes}
                            onChange={(e) => setUpdateNotes(e.target.value)}
                            data-testid="input-update-notes"
                          />
                        </div>

                        <p className="text-sm text-muted-foreground">
                          Atualize o valor atual em renda variável com a data da cotação.
                        </p>
                      </>
                    ) : (
                      <>
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
                          <Label htmlFor="updateDate">Data da Avaliação *</Label>
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
                            placeholder="Ex: Avaliação profissional, atualizações"
                            value={updateNotes}
                            onChange={(e) => setUpdateNotes(e.target.value)}
                            data-testid="input-update-notes"
                          />
                        </div>

                        <p className="text-sm text-muted-foreground">
                          Atualize o valor atual do ativo com a data da última avaliação.
                        </p>
                      </>
                    )}
                  </>
                )}

                {!selectedAssetMarket && (
                  <p className="text-sm text-muted-foreground">
                    Selecione um ativo para ver as opções de atualização.
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <Button 
                  type="submit" 
                  disabled={isLoading || existingAssets.length === 0 || (!onAddSnapshot && !onEdit)} 
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
