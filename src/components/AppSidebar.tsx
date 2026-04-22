import { LayoutDashboard, ClipboardList, Factory, Warehouse, Truck, Users, ShieldCheck, Layers, LogOut } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";

interface Item { title: string; url: string; icon: any; roles?: AppRole[] }

const items: Item[] = [
  { title: "Boshqaruv paneli", url: "/", icon: LayoutDashboard },
  { title: "Zakazlar", url: "/orders", icon: ClipboardList },
  { title: "Ishlab chiqarish", url: "/production", icon: Factory },
  { title: "Sklad", url: "/warehouse", icon: Warehouse },
  { title: "Ta'minot", url: "/supply", icon: Truck, roles: ["supply", "admin", "warehouse"] },
  { title: "Ishchilar statistikasi", url: "/workers", icon: Users },
  { title: "Bosqich shablonlari", url: "/templates", icon: Layers, roles: ["marketing", "admin"] },
  { title: "Audit log", url: "/audit", icon: ShieldCheck, roles: ["admin", "manager"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { roles, user, signOut, hasRole } = useAuth();
  const collapsed = state === "collapsed";
  const loc = useLocation();

  const visible = items.filter((i) => !i.roles || hasRole(i.roles));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">M</div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="font-semibold text-sm truncate">Manufacturing ERP</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{roles[0] ?? "ishchi"}</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menyu</SidebarGroupLabel>
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
          {!collapsed && <span className="ml-2">Chiqish</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
