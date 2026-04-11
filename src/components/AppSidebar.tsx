import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Warehouse,
  Users,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/context";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { t } = useI18n();
  const location = useLocation();

  const items = [
    { title: t.nav.dashboard, url: "/", icon: LayoutDashboard },
    { title: t.nav.orders, url: "/orders", icon: ClipboardList },
    { title: t.nav.production, url: "/production", icon: Factory },
    { title: t.nav.warehouse, url: "/warehouse", icon: Warehouse },
    { title: t.nav.workers, url: "/workers", icon: Users },
  ];

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <div className="px-4 py-5 flex items-center gap-2">
          <Factory className="h-7 w-7 text-sidebar-primary shrink-0" />
          {!collapsed && <span className="text-lg font-bold text-sidebar-accent-foreground tracking-tight">ERP Zavod</span>}
        </div>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end={item.url === "/"}
                      className="hover:bg-sidebar-accent/60"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
