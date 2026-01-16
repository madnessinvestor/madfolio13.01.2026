import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Bitcoin,
  Landmark,
  BarChart3,
  Building2,
  TrendingUp,
  FileText,
  Wallet,
  Coins,
  Twitter,
  Github,
  Youtube,
  MessageCircle,
  Instagram,
  Send,
} from "lucide-react";
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


export function AppSidebar() {
  const [location] = useLocation();
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <img src="/madfolio-logo.png" alt="MadFolio" className="h-[88px] w-[88px] rounded-lg" />
          <div>
            <h1 className="font-bold text-lg text-[#a855f7]">MadFolio</h1>
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
                    <Link href={item.url}>
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
          <span className="text-xs text-muted-foreground text-center">© 2025 MadFolio</span>
          <div className="flex items-center justify-center gap-3">
             {/* Social links truncated for brevity */}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
