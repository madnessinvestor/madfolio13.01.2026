import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Wallet, ExternalLink, Trash2, Plus } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface WalletBalance {
  id?: string;
  name: string;
  link: string;
  balance: string;
  lastUpdated: string;
  error?: string;
}

export default function WalletTracker() {
  const { toast } = useToast();
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletLink, setNewWalletLink] = useState("");
  const [newWalletPlatform, setNewWalletPlatform] = useState("step");
  const [isAddingWallet, setIsAddingWallet] = useState(false);

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

  const addWalletMutation = useMutation({
    mutationFn: async (data: { name: string; link: string; platform: string }) => {
      const response = await apiRequest("POST", "/api/wallets", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saldo/detailed"] });
      setNewWalletName("");
      setNewWalletLink("");
      setNewWalletPlatform("step");
      setIsAddingWallet(false);
      toast({
        title: "Sucesso",
        description: "Wallet adicionada com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao adicionar wallet.",
        variant: "destructive",
      });
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (walletId: string) => {
      const response = await apiRequest("DELETE", `/api/wallets/${walletId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/saldo/detailed"] });
      toast({
        title: "Sucesso",
        description: "Wallet removida com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro",
        description: "Falha ao remover wallet.",
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

  const getPlatformName = (link: string) => {
    if (link.includes("step.finance")) return "Solana";
    if (link.includes("debank.com")) return "DeBank";
    return "Link";
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-title">Wallet Tracker</h1>
          <p className="text-muted-foreground">Monitore saldos de suas wallets em múltiplas plataformas</p>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
        {balances?.map((wallet) => (
          <Card key={wallet.id || wallet.name} data-testid={`card-wallet-${wallet.id || wallet.name}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                {wallet.name}
              </CardTitle>
              <div className="flex items-center gap-2">
                <a
                  href={wallet.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                  data-testid={`link-wallet-${wallet.id || wallet.name}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                {wallet.id && (
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => deleteWalletMutation.mutate(wallet.id!)}
                    disabled={deleteWalletMutation.isPending}
                    data-testid={`button-delete-wallet-${wallet.id}`}
                  >
                    {deleteWalletMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 text-destructive" />
                    )}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`text-balance-${wallet.id || wallet.name}`}>
                {wallet.balance}
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {getPlatformName(wallet.link)}
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

        {isAddingWallet && (
          <Card className="border-2 border-dashed" data-testid="card-add-wallet">
            <CardHeader className="space-y-0 pb-3">
              <CardTitle className="text-sm font-medium">Adicionar Wallet</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Nome da wallet"
                value={newWalletName}
                onChange={(e) => setNewWalletName(e.target.value)}
                data-testid="input-wallet-name"
              />
              <Input
                placeholder="Link/URL da wallet"
                value={newWalletLink}
                onChange={(e) => setNewWalletLink(e.target.value)}
                data-testid="input-wallet-link"
              />
              <select
                value={newWalletPlatform}
                onChange={(e) => setNewWalletPlatform(e.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
                data-testid="select-platform"
              >
                <option value="step">Solana (Step.finance)</option>
                <option value="debank">EVM (DeBank)</option>
              </select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (newWalletName && newWalletLink) {
                      addWalletMutation.mutate({ 
                        name: newWalletName, 
                        link: newWalletLink,
                        platform: newWalletPlatform
                      });
                    } else {
                      toast({
                        title: "Erro",
                        description: "Preencha nome e link.",
                        variant: "destructive",
                      });
                    }
                  }}
                  disabled={addWalletMutation.isPending}
                  data-testid="button-save-wallet"
                >
                  {addWalletMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsAddingWallet(false);
                    setNewWalletName("");
                    setNewWalletLink("");
                    setNewWalletPlatform("step");
                  }}
                  data-testid="button-cancel-wallet"
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {!isAddingWallet && (
          <Card
            className="border-2 border-dashed cursor-pointer hover-elevate"
            onClick={() => setIsAddingWallet(true)}
            data-testid="card-add-wallet-trigger"
          >
            <CardContent className="flex items-center justify-center h-full min-h-[200px]">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Plus className="h-6 w-6" />
                <span className="text-sm">Adicionar Wallet</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-6 text-center text-sm text-muted-foreground">
        Os saldos sao obtidos via scraping de múltiplas plataformas usando Puppeteer. 
        A atualizacao automatica ocorre a cada 1 hora com intervalos de 10 segundos entre wallets.
      </div>
    </div>
  );
}
