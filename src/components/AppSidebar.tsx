import { LayoutDashboard, ClipboardList, Factory, Warehouse, ShieldCheck, LogOut, MessageSquare, History, UserCog, Users, Wallet, RotateCcw, AlertOctagon, FileBarChart, Truck } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import logo from "@/assets/logo.png"

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, signOut, hasRole, roles } = useAuth();
  const { t } = useI18n();
  const collapsed = state === "collapsed";
  const loc = useLocation();

  interface Item { title: string; url: string; icon: any; roles?: AppRole[] }
  const isEngineerOnly = roles.length > 0 && roles.every((r) => r === "engineer");
  const allItems: Item[] = [
    { title: t.nav.dashboard, url: "/", icon: LayoutDashboard },
    { title: t.nav.orders, url: "/orders", icon: ClipboardList },
    { title: t.nav.production, url: "/production", icon: Factory },
    { title: t.nav.nachalnik, url: "/nachalnik", icon: UserCog, roles: ["manager", "admin"] },
    { title: t.nav.otk, url: "/otk", icon: ShieldCheck },
    { title: t.nav.warehouse, url: "/warehouse", icon: Warehouse },
    { title: t.nav.supply, url: "/supply", icon: Truck },
    { title: t.nav.returns, url: "/returns", icon: RotateCcw, roles: ["warehouse", "admin"] },
    { title: t.nav.defects, url: "/defects", icon: AlertOctagon },
    { title: t.nav.hr, url: "/hr", icon: Users, roles: ["hr", "admin", "cashier"] },
    { title: t.nav.kassa, url: "/kassa", icon: Wallet, roles: ["cashier", "admin"] },
    { title: t.nav.chat, url: "/chat", icon: MessageSquare },
    { title: t.nav.reports, url: "/reports", icon: FileBarChart, roles: ["admin"] },
    { title: t.nav.audit, url: "/audit", icon: History, roles: ["admin"] },
  ];

  const engineerAllowed = new Set(["/", "/orders", "/production", "/chat"]);
  const items = isEngineerOnly ? allItems.filter((i) => engineerAllowed.has(i.url)) : allItems;

  const visible = items.filter((i) => !i.roles || hasRole(i.roles));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <img src={logo} className="w-10 h-10 rounded" />
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-semibold text-sm truncate">MCITY</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{roles[0] ? ((t.roles as any)[roles[0]] ?? roles[0]) : ""}</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={loc.pathname === item.url || (item.url !== "/" && loc.pathname.startsWith(item.url))}>
                    <NavLink to={item.url} end={item.url === "/"} className="flex items-center gap-2" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        {!collapsed && user && (
          <div className="px-2 py-2 text-xs text-muted-foreground truncate">{user.email}</div>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span className="ml-2">{t.nav.signOut}</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
