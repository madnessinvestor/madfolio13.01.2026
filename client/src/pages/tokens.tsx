import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, ExternalLink, Wallet, Briefcase, Coins } from "lucide-react";
import { useDisplayCurrency } from "@/hooks/use-currency";
import { formatCurrency } from "@/lib/utils";

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

export default function TokensPage() {
  const { displayCurrency } = useDisplayCurrency();

  const { data: walletTokens, isLoading } = useQuery<WalletTokens[]>({
    queryKey: ["/api/debank/detailed-tokens"],
    refetchInterval: 300000, // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Meus Tokens (DeBank)</h1>
      </div>

      {walletTokens?.map((wallet) => (
        <Card key={wallet.walletAddress} className="overflow-hidden">
          <CardHeader className="bg-muted/50 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-lg">{wallet.walletName}</CardTitle>
                  <p className="text-sm text-muted-foreground font-mono">
                    {wallet.walletAddress}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground uppercase font-semibold">Valor Total</p>
                <p className="text-xl font-bold text-primary">
                  {formatCurrency(wallet.totalValue, displayCurrency)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {wallet.tokens.map((token, idx) => (
                <div key={`${token.symbol}-${idx}`} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    {token.logo ? (
                      <img src={token.logo} alt={token.symbol} className="h-8 w-8 rounded-full bg-muted" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Coins className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{token.symbol}</span>
                        {token.protocol && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium uppercase">
                            {token.protocol}
                          </span>
                        )}
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium uppercase">
                          {token.chain}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{token.name}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">
                      {token.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {token.symbol}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatCurrency(token.value, displayCurrency)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {wallet.tokens.length === 0 && (
              <div className="p-8 text-center text-muted-foreground">
                Nenhum token encontrado ou erro ao carregar detalhes.
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <div className="text-center text-sm text-muted-foreground pt-4">
        <p>Dados obtidos via DeBank Scraper. Atualizado automaticamente a cada 5 minutos.</p>
        <a 
          href="https://debank.com" 
          target="_blank" 
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 hover:text-primary transition-colors mt-1"
        >
          Ver no DeBank <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
