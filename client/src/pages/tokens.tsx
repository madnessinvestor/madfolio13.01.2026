import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Loader2,
  ExternalLink,
  Wallet,
  Coins,
  TrendingUp,
  Layers,
} from "lucide-react";
import { useDisplayCurrency } from "@/hooks/use-currency";
import { useCurrencyConverter } from "@/components/CurrencySwitcher";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Token {
  name: string;
  symbol: string;
  amount: number;
  price: number;
  value: number;
  chain: string;
  category: "wallet" | "defi" | "lending" | "reward";
  protocol?: string;
  logo?: string;
}

interface WalletTokens {
  walletName: string;
  walletAddress: string;
  tokens: Token[];
  totalValue: number;
}

const CategoryIcon = ({ category }: { category: Token["category"] }) => {
  switch (category) {
    case "wallet":
      return <Wallet className="h-3 w-3" />;
    case "defi":
      return <TrendingUp className="h-3 w-3" />;
    case "lending":
      return <Layers className="h-3 w-3" />;
    case "reward":
      return <Coins className="h-3 w-3" />;
  }
};

const CategoryBadge = ({
  category,
  protocol,
}: {
  category: Token["category"];
  protocol?: string;
}) => {
  const categoryNames = {
    wallet: "Wallet",
    defi: "DeFi",
    lending: "Lending",
    reward: "Reward",
  };

  const categoryColors = {
    wallet: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    defi: "bg-green-500/10 text-green-500 border-green-500/20",
    lending: "bg-purple-500/10 text-purple-500 border-purple-500/20",
    reward: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  };

  return (
    <div className="flex items-center gap-1.5">
      <Badge
        variant="outline"
        className={`${categoryColors[category]} text-[10px] font-semibold uppercase tracking-wide`}
      >
        <CategoryIcon category={category} />
        <span className="ml-1">{categoryNames[category]}</span>
      </Badge>
      {protocol && (
        <Badge
          variant="outline"
          className="bg-muted text-muted-foreground text-[10px] font-medium uppercase"
        >
          {protocol}
        </Badge>
      )}
    </div>
  );
};

export default function TokensPage() {
  const { displayCurrency } = useDisplayCurrency();
  const { formatCurrency } = useCurrencyConverter();

  const {
    data: walletTokens,
    isLoading,
    error,
  } = useQuery<WalletTokens[]>({
    queryKey: ["/api/debank/detailed-tokens"],
    refetchInterval: 300000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            Carregando tokens do DeBank...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="text-center space-y-4">
          <p className="text-destructive">Erro ao carregar tokens</p>
          <p className="text-sm text-muted-foreground">{String(error)}</p>
        </div>
      </div>
    );
  }

  const totalPortfolioValue =
    walletTokens?.reduce((acc, wallet) => acc + wallet.totalValue, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Meus Tokens</h1>
          <p className="text-muted-foreground mt-1">
            Visualização detalhada dos seus ativos em todas as carteiras
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground uppercase font-semibold">
            Valor Total do Portfólio
          </p>
          <p className="text-3xl font-bold text-primary">
            {formatCurrency(totalPortfolioValue, displayCurrency)}
          </p>
        </div>
      </div>

      {/* Wallets */}
      {walletTokens?.map((wallet) => (
        <Card key={wallet.walletAddress} className="overflow-hidden border-2">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-xl">{wallet.walletName}</CardTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">
                    {wallet.walletAddress}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wide">
                  Valor Total
                </p>
                <p className="text-2xl font-bold text-primary">
                  {formatCurrency(wallet.totalValue, displayCurrency)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {wallet.tokens.length}{" "}
                  {wallet.tokens.length === 1 ? "token" : "tokens"}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {wallet.tokens.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-[40%]">Token</TableHead>
                      <TableHead className="text-center">Rede</TableHead>
                      <TableHead className="text-center">Tipo</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallet.tokens
                      .sort((a, b) => b.value - a.value) // Sort by value descending
                      .map((token, idx) => (
                        <TableRow
                          key={`${token.symbol}-${token.chain}-${idx}`}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          {/* Token Info */}
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {token.logo ? (
                                <img
                                  src={token.logo}
                                  alt={token.symbol}
                                  className="h-9 w-9 rounded-full bg-muted border border-border"
                                  onError={(e) => {
                                    (
                                      e.target as HTMLImageElement
                                    ).style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-primary/20">
                                  <Coins className="h-4 w-4 text-primary" />
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-base">
                                  {token.symbol}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {token.name}
                                </div>
                              </div>
                            </div>
                          </TableCell>

                          {/* Chain */}
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className="bg-secondary/50 text-xs font-medium"
                            >
                              {token.chain}
                            </Badge>
                          </TableCell>

                          {/* Category & Protocol */}
                          <TableCell className="text-center">
                            <CategoryBadge
                              category={token.category}
                              protocol={token.protocol}
                            />
                          </TableCell>

                          {/* Amount */}
                          <TableCell className="text-right font-mono">
                            <div className="font-medium">
                              {token.amount > 0
                                ? token.amount.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 6,
                                  })
                                : "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {token.symbol}
                            </div>
                          </TableCell>

                          {/* Price */}
                          <TableCell className="text-right font-mono">
                            {token.price > 0 ? (
                              <div className="text-sm">
                                {formatCurrency(token.price, displayCurrency)}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">
                                —
                              </div>
                            )}
                          </TableCell>

                          {/* Total Value */}
                          <TableCell className="text-right">
                            <div className="font-bold text-base">
                              {formatCurrency(token.value, displayCurrency)}
                            </div>
                            {token.price > 0 && token.amount > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {token.amount.toFixed(4)} ×{" "}
                                {formatCurrency(token.price, displayCurrency)}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Coins className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">
                  Nenhum token encontrado
                </p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Pode haver um erro ao carregar os dados desta carteira
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Empty State */}
      {(!walletTokens || walletTokens.length === 0) && (
        <Card className="border-2 border-dashed">
          <CardContent className="flex flex-col items-center justify-center p-12">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Wallet className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Nenhuma carteira configurada
            </h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              Adicione carteiras DeBank para visualizar seus tokens aqui
            </p>
          </CardContent>
        </Card>
      )}

      {/* Footer */}
      <div className="text-center space-y-2 pt-4 pb-2">
        <p className="text-sm text-muted-foreground">
          Dados obtidos via scraping do DeBank • Atualização automática a cada 5
          minutos
        </p>
        <a
          href="https://debank.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline transition-all"
        >
          Ver no DeBank <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}
