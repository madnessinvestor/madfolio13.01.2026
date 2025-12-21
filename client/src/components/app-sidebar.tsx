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
import {
  LayoutDashboard,
  Bitcoin,
  Landmark,
  BarChart3,
  Building2,
  FileText,
  Wallet,
  TrendingUp,
} from "lucide-react";
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
  {
    title: "Wallet Tracker",
    url: "/debank",
    icon: Wallet,
  },
];

export function AppSidebar() {
  const [location] = useLocation();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src="/madfolio-logo.png" alt="MadFolio" className="h-[88px] w-[88px] rounded-lg" />
          <div>
            <h1 className="font-bold text-lg" style={{color: '#a855f7', textShadow: '0 0 20px #a855f7, 0 0 10px #7c3aed'}}>MadFolio</h1>
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
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, '-')}`}>
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
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">© 2025 MadFolio</span>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
