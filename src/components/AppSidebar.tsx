import { LayoutDashboard, ClipboardList, Factory, Warehouse, ShieldCheck, LogOut, MessageSquare, History, UserCog, Users, Wallet, RotateCcw, AlertOctagon, FileBarChart, Truck, Wrench, Contact, ScanFace, Plane, FileText, Layers, Ruler } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useAuth, type AppRole } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/notifications/NotificationsContext";
import logo from "@/assets/logo.png"

export function AppSidebar() {
  const { state } = useSidebar();
  const { user, signOut, hasRole, roles } = useAuth();
  const { t } = useI18n();
  const { unreadByUrl } = useNotifications();
  const collapsed = state === "collapsed";
  const loc = useLocation();

  interface Item { title: string; url: string; icon: any; roles?: AppRole[] }
  const isEngineerOnly = roles.length > 0 && roles.every((r) => r === "engineer");
  const allItems: Item[] = [
    { title: t.nav.dashboard, url: "/", icon: LayoutDashboard },
    { title: t.nav.orders, url: "/orders", icon: ClipboardList },
    { title: (t.nav as any).clients ?? "Klientlar (CRM)", url: "/clients", icon: Contact },

    { title: t.nav.production, url: "/production", icon: Factory },
    { title: "Bosqich guruhlari", url: "/stage-groups", icon: Layers, roles: ["manager", "admin"] },
    { title: t.nav.nachalnik, url: "/nachalnik", icon: UserCog, roles: ["manager", "admin"] },
    { title: (t.nav as any).service ?? "Remont (Servis)", url: "/service", icon: Wrench, roles: ["manager", "admin"] },
    { title: t.nav.otk, url: "/otk", icon: ShieldCheck },
    { title: t.nav.warehouse, url: "/warehouse", icon: Warehouse },
    { title: "Nakladnoy", url: "/invoices", icon: FileText, roles: ["admin", "warehouse", "supply"] },
    { title: "Metall hisobi", url: "/metal", icon: Ruler, roles: ["admin", "engineer", "warehouse"] },
    { title: t.nav.supply, url: "/supply", icon: Truck },
    { title: t.nav.returns, url: "/returns", icon: RotateCcw, roles: ["warehouse", "admin"] },
    { title: t.nav.defects, url: "/defects", icon: AlertOctagon },
    { title: t.nav.hr, url: "/hr", icon: Users, roles: ["hr", "admin", "cashier"] },
    { title: (t.nav as any).faceId ?? "Face_id (Davomat)", url: "/face-id", icon: ScanFace, roles: ["hr", "admin"] },
    { title: "Kassa", url: "/kassa", icon: Wallet, roles: ["cashier", "admin"] },
    { title: "Kamandirovka", url: "/trips", icon: Plane },
    { title: t.nav.chat, url: "/chat", icon: MessageSquare },
    { title: t.nav.reports, url: "/reports", icon: FileBarChart, roles: ["admin"] },
    { title: t.nav.audit, url: "/audit", icon: History, roles: ["admin"] },
  ];

  const engineerAllowed = new Set(["/", "/orders", "/production", "/warehouse", "/metal", "/supply", "/chat"]);
  // Oddiy xodim faqat o'ziga tegishli bo'limlarni ko'radi.
  const isWorkerOnly = roles.length > 0 && roles.every((r) => r === "worker");
  const workerAllowed = new Set(["/trips", "/chat"]);
  const items = isEngineerOnly
    ? allItems.filter((i) => engineerAllowed.has(i.url))
    : isWorkerOnly
      ? allItems.filter((i) => workerAllowed.has(i.url))
      : allItems;

  // Per-role sidebar visibility overrides (does not affect permissions/routes)
  const isAdmin = roles.includes("admin");
  const hiddenByRole: Record<string, string[]> = {
    warehouse: ["/", "/production", "/otk"],
    marketing: ["/defects"],
    supply: ["/", "/production", "/otk", "/defects"],
  };
  const extraByRole: Record<string, string[]> = {
    supply: ["/returns"],
    otk: ["/returns"],
    manager: ["/returns", "/hr"],
  };
  const hidden = new Set<string>();
  const extras = new Set<string>();
  if (!isAdmin) {
    for (const r of roles) {
      (hiddenByRole[r] ?? []).forEach((u) => hidden.add(u));
      (extraByRole[r] ?? []).forEach((u) => extras.add(u));
    }
    extras.forEach((u) => hidden.delete(u));
  }

  const visible = items.filter((i) => {
    if (hidden.has(i.url)) return false;
    if (!i.roles || hasRole(i.roles)) return true;
    return extras.has(i.url);
  });

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
              {visible.map((item) => {
                const unread = unreadByUrl[item.url] ?? 0;
                return (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={loc.pathname === item.url || (item.url !== "/" && loc.pathname.startsWith(item.url))}>
                    <NavLink to={item.url} end={item.url === "/"} className="flex items-center gap-2" activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium">
                      <span className="relative shrink-0">
                        <item.icon className="h-4 w-4" />
                        {collapsed && unread > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 h-2 w-2 rounded-full bg-destructive" />
                        )}
                      </span>
                      {!collapsed && <span className="flex-1 truncate">{item.title}</span>}
                      {!collapsed && unread > 0 && (
                        <Badge variant="destructive" className="h-5 min-w-[1.25rem] px-1.5 text-[11px] rounded-full justify-center">
                          {unread > 99 ? "99+" : unread}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                );
              })}
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
