import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Wallet, ExternalLink } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface WalletBalance {
  name: string;
  address: string;
  balance: string;
  lastUpdated: string;
  error?: string;
}

export default function DeBankBalances() {
  const { toast } = useToast();

  const { data: balances, isLoading, error } = useQuery<WalletBalance[]>({
    queryKey: ["/api/saldo/detailed"],
    refetchInterval: 60000,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/saldo/refresh");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saldo/detailed"] });
      toast({
        title: "Atualizando saldos",
        description: "Os saldos estao sendo atualizados em segundo plano.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao atualizar os saldos.",
        variant: "destructive",
      });
    },
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-destructive">Erro ao carregar saldos</p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/saldo/detailed"] })}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-title">Dashboard de Saldos DeBank</h1>
          <p className="text-muted-foreground">Saldos atualizados automaticamente a cada 15 minutos</p>
        </div>
        <Button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          variant="outline"
          data-testid="button-refresh"
        >
          {refreshMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Atualizar Agora
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {balances?.map((wallet) => (
          <Card key={wallet.name} data-testid={`card-wallet-${wallet.name}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                {wallet.name}
              </CardTitle>
              <a
                href={`https://debank.com/profile/${wallet.address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`text-balance-${wallet.name}`}>
                {wallet.balance}
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {truncateAddress(wallet.address)}
                </span>
                {wallet.error ? (
                  <Badge variant="destructive" className="text-xs">Erro</Badge>
                ) : wallet.balance === "Loading..." ? (
                  <Badge variant="secondary" className="text-xs">Carregando</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">Atualizado</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Ultima atualizacao: {formatDate(wallet.lastUpdated)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Os saldos sao obtidos via scraping do DeBank usando Puppeteer. 
        A atualizacao automatica ocorre a cada 15 minutos.
      </div>
    </div>
  );
}
