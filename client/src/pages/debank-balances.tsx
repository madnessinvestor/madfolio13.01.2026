import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, Wallet, ExternalLink, Trash2, Plus, TrendingUp, TrendingDown, Eye, EyeOff } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

export default function WalletTracker() {
  const { toast } = useToast();
  const [newWalletName, setNewWalletName] = useState("");
  const [newWalletLink, setNewWalletLink] = useState("");
  const [isAddingWallet, setIsAddingWallet] = useState(false);
  const [selectedWalletForHistory, setSelectedWalletForHistory] = useState<string | null>(null);
  const [updatingWallets, setUpdatingWallets] = useState<Set<string>>(new Set());
  const [hiddenBalances, setHiddenBalances] = useState<Set<string>>(new Set());

  const toggleBalanceVisibility = (walletName: string) => {
    setHiddenBalances(prev => {
      const newSet = new Set(prev);
      if (newSet.has(walletName)) {
        newSet.delete(walletName);
      } else {
        newSet.add(walletName);
      }
      return newSet;
    });
  };

  const { data: balances, isLoading, error, refetch } = useQuery<WalletBalance[]>({
    queryKey: ["/api/saldo/detailed"],
    refetchInterval: false, // Desabilitado para evitar race conditions
    staleTime: 30000, // Cache válido por 30 segundos
    retry: 1, // Tentar apenas 1 vez para evitar delay
    refetchOnWindowFocus: false, // Evitar refetch automático
  });

  // Auto-refresh wallet balances when component mounts
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Timeout de segurança: limpar wallets em atualização após 90 segundos
  useEffect(() => {
    if (updatingWallets.size > 0) {
      const timeout = setTimeout(() => {
        setUpdatingWallets(new Set());
        queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      }, 90000); // 90 segundos
      
      return () => clearTimeout(timeout);
    }
  }, [updatingWallets]);

  const { data: stats } = useQuery<any>({
    queryKey: ["/api/saldo/stats", selectedWalletForHistory],
    queryFn: async () => {
      const response = await fetch(`/api/saldo/stats/${encodeURIComponent(selectedWalletForHistory || '')}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    },
    enabled: !!selectedWalletForHistory,
  });

  const { data: history } = useQuery<any[]>({
    queryKey: ["/api/saldo/history", selectedWalletForHistory],
    queryFn: async () => {
      const response = await fetch(`/api/saldo/history/${encodeURIComponent(selectedWalletForHistory || '')}`);
      if (!response.ok) throw new Error('Failed to fetch history');
      return response.json();
    },
    enabled: !!selectedWalletForHistory,
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/saldo/refresh", {});
      return response.json();
    },
    onSuccess: async (data) => {
      // ✅ CORREÇÃO: usar refetchQueries ao invés de invalidateQueries
      // refetchQueries força um fetch imediato, ignorando staleTime
      await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      toast({
        title: "Saldos atualizados",
        description: "Os saldos foram atualizados com sucesso. Intervalo mínimo de 1 minuto por wallet e 20 segundos entre wallets.",
      });
    },
    onError: async () => {
      // ✅ Mesmo em erro, força refetch para obter fallback values
      await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      toast({
        title: "Erro",
        description: "Falha ao atualizar os saldos.",
        variant: "destructive",
      });
    },
    onSettled: async () => {
      // ✅ Garantir que sempre atualize após finalizar (sucesso ou erro)
      setTimeout(async () => {
        await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      }, 1000);
    },
  });

  const addWalletMutation = useMutation({
    mutationFn: async (data: { name: string; link: string }) => {
      const response = await apiRequest("POST", "/api/wallets", data);
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      setNewWalletName("");
      setNewWalletLink("");
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
      return apiRequest("DELETE", `/api/wallets/${walletId}`).then(res => res.json());
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      toast({
        title: "Sucesso",
        description: "Wallet removida com sucesso.",
      });
    },
    onError: (error: any) => {
      console.error("Delete error:", error);
      toast({
        title: "Erro",
        description: error?.message || "Falha ao remover wallet.",
        variant: "destructive",
      });
    },
  });

  const refreshWalletMutation = useMutation({
    mutationFn: async (walletName: string) => {
      setUpdatingWallets(prev => new Set([...Array.from(prev), walletName]));
      try {
        const response = await apiRequest("POST", `/api/saldo/refresh/${encodeURIComponent(walletName)}`, {});
        return response.json();
      } finally {
        setUpdatingWallets(prev => {
          const newSet = new Set(Array.from(prev));
          newSet.delete(walletName);
          return newSet;
        });
      }
    },
    onSuccess: async () => {
      // ✅ CORREÇÃO: usar refetchQueries ao invés de invalidateQueries
      await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      toast({
        title: "Sucesso",
        description: "Wallet atualizada.",
      });
    },
    onError: async () => {
      // ✅ Mesmo em erro, força refetch para obter fallback values
      await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      toast({
        title: "Erro",
        description: "Falha ao atualizar wallet.",
        variant: "destructive",
      });
    },
    onSettled: async () => {
      // ✅ Garantir que sempre atualize após finalizar
      setTimeout(async () => {
        await queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] });
      }, 1000);
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

  const getStatusDisplay = (wallet: WalletBalance) => {
    if (wallet.status === 'success') {
      return { label: 'Atualizado', variant: 'outline' as const };
    } else if (wallet.status === 'temporary_error') {
      return { label: 'Valor anterior', variant: 'secondary' as const };
    } else {
      return { label: 'Indisponível', variant: 'destructive' as const };
    }
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
        <Button onClick={() => queryClient.refetchQueries({ queryKey: ["/api/saldo/detailed"] })}>
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
        {balances?.filter(wallet => wallet.name !== 'SOL-madnessmain' && wallet.name !== 'SOL-madnesstwo').map((wallet) => (
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
                {/* Botão de histórico sempre ativo, independente do estado de carregamento */}
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedWalletForHistory(wallet.name)}
                  data-testid={`button-view-history-${wallet.id || wallet.name}`}
                  title="Ver histórico"
                >
                  <TrendingUp className="h-4 w-4" />
                </Button>
                {wallet.id && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => refreshWalletMutation.mutate(wallet.name)}
                      disabled={updatingWallets.has(wallet.name)}
                      data-testid={`button-refresh-wallet-${wallet.id}`}
                      title="Atualizar esta wallet"
                    >
                      {updatingWallets.has(wallet.name) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
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
                  </>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-2">
                <div className="text-2xl font-bold" data-testid={`text-balance-${wallet.id || wallet.name}`}>
                  {hiddenBalances.has(wallet.name) ? '***' : wallet.balance}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => toggleBalanceVisibility(wallet.name)}
                  data-testid={`button-toggle-balance-${wallet.id || wallet.name}`}
                  title={hiddenBalances.has(wallet.name) ? 'Mostrar saldo' : 'Ocultar saldo'}
                >
                  {hiddenBalances.has(wallet.name) ? (
                    <Eye className="h-4 w-4" />
                  ) : (
                    <EyeOff className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {getPlatformName(wallet.link)}
                </span>
                {wallet.balance === "Loading..." || wallet.balance === "Carregando..." ? (
                  <Badge variant="secondary" className="text-xs">Carregando</Badge>
                ) : (
                  <Badge variant={getStatusDisplay(wallet).variant} className="text-xs">
                    {getStatusDisplay(wallet).label}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Última atualização: {formatDate(wallet.lastUpdated)}
              </p>
              {wallet.error && (
                <p className="text-xs text-destructive mt-1">
                  {wallet.error}
                </p>
              )}
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
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    if (newWalletName && newWalletLink) {
                      addWalletMutation.mutate({ 
                        name: newWalletName, 
                        link: newWalletLink
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
        Os saldos são obtidos via scraping de múltiplas plataformas usando Puppeteer. 
        A atualização automática ocorre a cada 1 hora com intervalo de 1 minuto por wallet e 20 segundos entre wallets diferentes.
        Histórico completo salvo no cache do backend.
      </div>

      {/* History Dialog */}
      <Dialog open={!!selectedWalletForHistory} onOpenChange={(open) => !open && setSelectedWalletForHistory(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedWalletForHistory} - Histórico e Estatísticas</DialogTitle>
            <DialogDescription>
              Visualize o histórico de saldos e tendências
            </DialogDescription>
          </DialogHeader>

          {stats && (
            <div className="grid grid-cols-2 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Atual</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">${stats.currentBalance.toFixed(2)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stats.change >= 0 ? 'Ganho' : 'Perda'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-2">
                  <div className="text-2xl font-bold">
                    {stats.change >= 0 ? '+' : ''}{stats.change.toFixed(2)}
                  </div>
                  {stats.change >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-green-500" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-red-500" />
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Mínimo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg">${stats.minBalance.toFixed(2)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Máximo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg">${stats.maxBalance.toFixed(2)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Média</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-lg">${stats.avgBalance.toFixed(2)}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Variação</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className={`text-lg font-semibold ${stats.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.changePercent >= 0 ? '+' : ''}{stats.changePercent.toFixed(2)}%
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold">Últimas 20 Atualizações</h3>
            {history?.slice(0, 20).map((entry, idx) => (
              <div key={idx} className="flex justify-between items-center p-2 border rounded text-sm">
                <span className="text-muted-foreground">
                  {new Date(entry.timestamp).toLocaleString('pt-BR')}
                </span>
                <span className="font-medium">{entry.balance}</span>
                <Badge variant={entry.status === 'success' ? 'outline' : 'secondary'} className="text-xs">
                  {entry.status === 'success' ? '✓' : '◐'}
                </Badge>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
