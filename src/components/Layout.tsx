import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NotificationBell } from "@/components/NotificationBell";
import { useI18n } from "@/i18n/context";

export function Layout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <SidebarProvider>
      <div className="min-h-svh flex w-full min-w-0">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-card px-4 shrink-0 gap-3">
            <SidebarTrigger />
            <span className="text-sm text-muted-foreground flex-1">{t.appName}</span>
            <NotificationBell />
            <LanguageSwitcher />
          </header>
          <main className="erp-main min-w-0 w-full flex-1 p-3 sm:p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
