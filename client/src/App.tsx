import { Switch, Route } from "wouter";
import { createContext, useContext, useState } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CurrencySwitcher, type DisplayCurrency } from "@/components/CurrencySwitcher";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LogOut, Loader2, Save, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CurrencyContextType {
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  isBalanceHidden: boolean;
  setIsBalanceHidden: (hidden: boolean) => void;
}

const CurrencyContext = createContext<CurrencyContextType | null>(null);

export function useDisplayCurrency() {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error("useDisplayCurrency must be used within a CurrencyProvider");
  }
  return context;
}

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CryptoPage from "@/pages/crypto";
import FixedIncomePage from "@/pages/fixed-income";
import VariableIncomePage from "@/pages/variable-income";
import RealEstatePage from "@/pages/real-estate";
import HistoryPage from "@/pages/history";
import StatementsPage from "@/pages/statements";
import LandingPage from "@/pages/landing";
import DeBankBalances from "@/pages/debank-balances";
import UpdateInvestmentsPage from "@/pages/update-investments";

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
      <Route path="/debank" component={DeBankBalances} />
      <Route path="/update-investments" component={UpdateInvestmentsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  const { toast } = useToast();
  const context = useContext(CurrencyContext);
  const [isSaved, setIsSaved] = useState(false);

  if (!context) {
    return null;
  }
  
  const { displayCurrency, setDisplayCurrency, isBalanceHidden, setIsBalanceHidden } = context;
  
  const saveMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/sync");
      return true;
    },
    onSuccess: () => {
      setIsSaved(true);
      toast({
        title: "Dados salvos com sucesso!",
        description: "Todas as suas alterações foram sincronizadas no servidor.",
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
              {user && (
                <div className="flex items-center gap-2">
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
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.profileImageUrl || undefined} />
                    <AvatarFallback>
                      {user.firstName?.[0] || user.email?.[0] || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm hidden sm:inline">
                    {user.firstName || user.username || user.email}
                  </span>
                  <Button variant="ghost" size="icon" asChild>
                    <a href="/api/logout">
                      <LogOut className="h-4 w-4" />
                    </a>
                  </Button>
                </div>
              )}
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

const CurrencyProvider = ({ children }: { children: React.ReactNode }) => {
  const [displayCurrency, setDisplayCurrency] = useState<DisplayCurrency>("BRL");
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);

  return (
    <CurrencyContext.Provider value={{ displayCurrency, setDisplayCurrency, isBalanceHidden, setIsBalanceHidden }}>
      {children}
    </CurrencyContext.Provider>
  );
};

function App() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return (
    <AuthenticatedApp />
  );
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
