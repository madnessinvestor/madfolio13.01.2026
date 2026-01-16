import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "./ThemeToggle";

const menuItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
  },
  {
    title: "Mercado Cripto",
    url: "/crypto",
    icon: Bitcoin,
  },
  {
    title: "Renda Fixa",
    url: "/fixed-income",
    icon: Landmark,
  },
  {
    title: "Renda Variável",
    url: "/variable-income",
    icon: BarChart3,
  },
  {
    title: "Imóveis",
    url: "/real-estate",
    icon: Building2,
  },
  {
    title: "Evolução do Portfólio",
    url: "/monthly-snapshots",
    icon: TrendingUp,
  },
  {
    title: "Lançamentos",
    url: "/activity",
    icon: FileText,
  },

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img
            src="/madfolio-logo.png"
            alt="MadFolio"
            className="h-[88px] w-[88px] rounded-lg"
          />
          <div>
            <h1
              className="font-bold text-lg"
              style={{
                color: "#a855f7",
                textShadow: "0 0 20px #a855f7, 0 0 10px #7c3aed",
              }}
            >
              MadFolio
            </h1>
            <p className="text-xs text-muted-foreground">Portfolio Manager</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={location === item.url}>
                    <Link
                      href={item.url}
                      data-testid={`link-${item.title
                        .toLowerCase()
                        .replace(/\s/g, "-")}`}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
        <div className="flex flex-col gap-3">
          <span className="text-xs text-muted-foreground text-center">
            © 2025 MadFolio by MadnessInvestor
          </span>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="https://x.com/madnessinvestor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Twitter/X"
            >
              <Twitter className="h-4 w-4" />
            </a>
            <a
              href="https://github.com/madnessinvestor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4" />
            </a>
            <a
              href="https://www.youtube.com/@madnessinvestor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="YouTube"
            >
              <Youtube className="h-4 w-4" />
            </a>
            <a
              href="https://farcaster.xyz/madnessinvestor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Farcaster"
            >
              <MessageCircle className="h-4 w-4" />
            </a>
            <a
              href="https://www.instagram.com/madnessinvestor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="h-4 w-4" />
            </a>
            <a
              href="https://t.me/madnessinvestor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Telegram"
            >
              <Send className="h-4 w-4" />
            </a>
            <a
              href="https://discord.com/users/madnessinvestor"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Discord"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
            </a>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
