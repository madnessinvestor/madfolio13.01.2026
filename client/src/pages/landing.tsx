import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Wallet, TrendingUp, Landmark, BarChart3, Loader2, Mail, Lock, User, Image as ImageIcon } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DatabaseIndicator } from "@/components/DatabaseIndicator";

interface AuthFormData {
  email?: string;
  credential?: string;
  password: string;
  username?: string;
  profileImage?: string;
}

export default function LandingPage() {
  const { toast } = useToast();
  const [loginCredential, setLoginCredential] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerProfileImage, setRegisterProfileImage] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: async (data: AuthFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao fazer login",
        description: error.message || "Email ou senha incorretos",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: AuthFormData) => {
      const response = await apiRequest("POST", "/api/auth/register", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Não foi possível criar sua conta",
        variant: "destructive",
      });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginCredential || !loginPassword) return;
    loginMutation.mutate({ credential: loginCredential, password: loginPassword });
  };

  const compressImage = (file: File, callback: (compressed: string) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        // Redimensionar se necessário (máximo 400x400)
        const maxDimension = 400;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
        }

        // Converter para JPEG com qualidade reduzida (0.7)
        const compressed = canvas.toDataURL("image/jpeg", 0.7);
        callback(compressed);
      };
    };
    reader.readAsDataURL(file);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validar tamanho máximo de 2MB (antes da compressão)
      const maxSizeInBytes = 2 * 1024 * 1024; // 2MB
      if (file.size > maxSizeInBytes) {
        toast({
          title: "Arquivo muito grande",
          description: `A foto deve ter no máximo 2MB. Seu arquivo tem ${(file.size / 1024 / 1024).toFixed(2)}MB.`,
          variant: "destructive",
        });
        return;
      }

      // Validar tipos de arquivo
      const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Formato inválido",
          description: "A foto deve estar em formato JPG, PNG, GIF ou WebP.",
          variant: "destructive",
        });
        return;
      }

      // Comprimir imagem
      compressImage(file, (compressed) => {
        // Validar tamanho após compressão
        const compressedSizeInKB = (compressed.length * 0.75) / 1024; // base64 é ~33% maior
        if (compressedSizeInKB > 200) {
          toast({
            title: "Imagem ainda muito grande após compressão",
            description: "Tente usar uma imagem menor ou de menor resolução.",
            variant: "destructive",
          });
          return;
        }
        setRegisterProfileImage(compressed);
      });
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerUsername || !registerEmail || !registerPassword) return;
    registerMutation.mutate({
      username: registerUsername,
      email: registerEmail,
      password: registerPassword,
      profileImage: registerProfileImage || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-6">
      <div className="absolute top-4 right-4">
        <DatabaseIndicator />
      </div>
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="text-center space-y-4">
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

        <div className="max-w-md mx-auto">
          <Card>
            <CardHeader className="text-center">
              <CardTitle>Acesse sua conta</CardTitle>
              <CardDescription>
                Faça login ou crie uma conta para começar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login" data-testid="tab-login">Entrar</TabsTrigger>
                  <TabsTrigger value="register" data-testid="tab-register">Criar Conta</TabsTrigger>
                </TabsList>
                
                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-credential">Email ou Usuário</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-credential"
                          type="text"
                          placeholder="seu@email.com ou seu_usuario"
                          value={loginCredential}
                          onChange={(e) => setLoginCredential(e.target.value)}
                          className="pl-10"
                          data-testid="input-login-credential"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="login-password">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="Sua senha"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="pl-10"
                          data-testid="input-login-password"
                        />
                      </div>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={loginMutation.isPending}
                      data-testid="button-login"
                    >
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Entrando...
                        </>
                      ) : (
                        "Entrar"
                      )}
                    </Button>
                  </form>
                  
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou</span>
                    </div>
                  </div>
                  
                  <Button variant="outline" className="w-full" asChild>
                    <a href="/api/login" data-testid="button-login-google">
                      Entrar com Google
                    </a>
                  </Button>
                </TabsContent>
                
                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-username">Usuário</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="register-username"
                          placeholder="Escolha um usuário"
                          value={registerUsername}
                          onChange={(e) => setRegisterUsername(e.target.value)}
                          className="pl-10"
                          data-testid="input-register-username"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="register-email"
                          type="email"
                          placeholder="seu@email.com"
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                          className="pl-10"
                          data-testid="input-register-email"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="register-password">Senha</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="register-password"
                          type="password"
                          placeholder="Mínimo 6 caracteres"
                          value={registerPassword}
                          onChange={(e) => setRegisterPassword(e.target.value)}
                          className="pl-10"
                          data-testid="input-register-password"
                        />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <Label htmlFor="register-image">Foto de Perfil (Opcional)</Label>
                      <div className="flex flex-col gap-3">
                        {registerProfileImage && (
                          <div className="flex justify-center">
                            <Avatar className="h-20 w-20">
                              <AvatarImage src={registerProfileImage} />
                              <AvatarFallback>
                                {registerUsername?.[0]?.toUpperCase() || "U"}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        )}
                        <div className="relative">
                          <ImageIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="register-image"
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="pl-10"
                            data-testid="input-register-image"
                          />
                        </div>
                      </div>
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      disabled={registerMutation.isPending}
                      data-testid="button-register"
                    >
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Criando conta...
                        </>
                      ) : (
                        "Criar Conta"
                      )}
                    </Button>
                  </form>
                  
                  <div className="relative my-4">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">ou</span>
                    </div>
                  </div>
                  
                  <Button variant="outline" className="w-full" asChild>
                    <a href="/api/login" data-testid="button-register-google">
                      Criar conta com Google
                    </a>
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        
        <p className="text-center text-sm text-muted-foreground">
          Seus dados são salvos automaticamente e ficam sincronizados em qualquer dispositivo.
        </p>
      </div>
    </div>
  );
}
