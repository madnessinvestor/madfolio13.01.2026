import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, TrendingUp, Landmark, BarChart3 } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-6">
      <div className="max-w-4xl mx-auto text-center space-y-8">
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-primary/10 rounded-full">
              <Wallet className="h-16 w-16 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            Portfolio Tracker
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Acompanhe seus investimentos em criptomoedas e mercado tradicional em um só lugar.
            Preços atualizados automaticamente.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <Card>
            <CardHeader className="pb-2">
              <TrendingUp className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Cripto</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Bitcoin, Ethereum e mais. Preços em tempo real via CoinGecko.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <Landmark className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Renda Fixa</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                CDBs, LCIs, LCAs e títulos. Cadastre e atualize valores manualmente.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <BarChart3 className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Renda Variável</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Ações, FIIs e ETFs da B3 com preços atualizados automaticamente.
              </CardDescription>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <BarChart3 className="h-8 w-8 text-primary mb-2" />
              <CardTitle className="text-lg">Relatórios</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                Gráficos de evolução e extratos mensais do seu portfólio.
              </CardDescription>
            </CardContent>
          </Card>
        </div>

        <div className="pt-4">
          <Button size="lg" className="text-lg px-8" asChild>
            <a href="/api/login">
              Entrar com Google
            </a>
          </Button>
          <p className="text-sm text-muted-foreground mt-4">
            Faça login com sua conta Google para começar
          </p>
        </div>
      </div>
    </div>
  );
}
