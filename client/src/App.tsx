import { Switch, Route } from "wouter";
import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DatabaseIndicator } from "@/components/DatabaseIndicator";
import { CurrencySwitcher, type DisplayCurrency } from "@/components/CurrencySwitcher";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Loader2, Save, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { CurrencyProvider, useDisplayCurrency } from "@/hooks/use-currency";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CryptoPage from "@/pages/crypto";
import FixedIncomePage from "@/pages/fixed-income";
import VariableIncomePage from "@/pages/variable-income";
import RealEstatePage from "@/pages/real-estate";
import HistoryPage from "@/pages/history";
import StatementsPage from "@/pages/statements";
import DeBankBalances from "@/pages/debank-balances";
import UpdateInvestmentsPage from "@/pages/update-investments";
import ActivityPage from "@/pages/activity";
import MonthlySnapshotsPage from "@/pages/monthly-snapshots";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/crypto" component={CryptoPage} />
      <Route path="/fixed-income" component={FixedIncomePage} />
      <Route path="/variable-income" component={VariableIncomePage} />
      <Route path="/real-estate" component={RealEstatePage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/statements" component={StatementsPage} />
      <Route path="/activity" component={ActivityPage} />
      <Route path="/debank" component={DeBankBalances} />
      <Route path="/update-investments" component={UpdateInvestmentsPage} />
      <Route path="/monthly-snapshots" component={MonthlySnapshotsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function MainApp() {
  const { toast } = useToast();
  const { displayCurrency, setDisplayCurrency, isBalanceHidden, setIsBalanceHidden } = useDisplayCurrency();
  const [isSaved, setIsSaved] = useState(false);
  
  // Sincronizar dados automaticamente ao carregar
  useEffect(() => {
    const syncData = async () => {
      try {
        const response = await apiRequest("POST", "/api/sync") as any;
        if (response?.success) {
          queryClient.invalidateQueries();
        }
      } catch (error) {
        console.error("Auto-sync failed:", error);
      }
    };
    
    syncData();
    // Sincronizar a cada 5 minutos
    const interval = setInterval(syncData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/sync") as any;
      return response;
    },
    onSuccess: (response: any) => {
      setIsSaved(true);
      queryClient.invalidateQueries();
      toast({
        title: "Dados salvos com sucesso!",
        description: `${response?.stats?.assets || 0} ativos, ${response?.stats?.wallets || 0} carteiras sincronizadas.`,
      });
      setTimeout(() => setIsSaved(false), 3000);
    },
    onError: () => {
      toast({
        title: "Erro ao salvar",
        description: "Tente novamente em alguns instantes.",
        variant: "destructive",
      });
    },
  });
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-3 border-b bg-background sticky top-0 z-50">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-3">
              <DatabaseIndicator />
              <CurrencySwitcher value={displayCurrency} onChange={setDisplayCurrency} />
              <button
                onClick={() => setIsBalanceHidden(!isBalanceHidden)}
                className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-full hover:bg-accent"
                title={isBalanceHidden ? 'Mostrar saldos' : 'Ocultar saldos'}
                data-testid="button-toggle-all-balances"
              >
                {isBalanceHidden ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-4.803m5.604-1.888A3.375 3.375 0 1015.75 10.5M9.879 16.121A3 3 0 1015.75 10.5" />
                  </svg>
                )}
              </button>
              <ThemeToggle />
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                data-testid="button-save-changes"
                className="gap-2"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isSaved ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">
                  {isSaved ? "Salvo!" : "Salvar"}
                </span>
              </Button>
              <div className="flex items-center gap-2 pl-2 border-l">
                <Avatar className="h-8 w-8" data-testid="avatar-madnessinvestor">
                  <AvatarImage src="/madnessinvestor-profile.png" alt="madnessinvestor" />
                  <AvatarFallback>MD</AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden sm:inline">madnessinvestor</span>
              </div>
            </div>
          </header>
          <main className="flex-1 overflow-auto bg-background">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return <MainApp />;
}

function AppWrapper() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <CurrencyProvider>
          <App />
        </CurrencyProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default AppWrapper;
