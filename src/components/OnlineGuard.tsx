import { useEffect, useState } from "react";
import { WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Blocks the entire app when the browser reports it is offline.
 * The ERP is online-only — no writes are allowed without a network connection.
 */
export default function OnlineGuard({ children }: { children: React.ReactNode }) {
  const [online, setOnline] = useState<boolean>(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return (
    <>
      {children}
      {!online && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 backdrop-blur-sm"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="max-w-md w-[90%] rounded-xl border bg-card p-6 shadow-xl text-center space-y-4">
            <div className="mx-auto w-14 h-14 rounded-full bg-status-red/10 flex items-center justify-center">
              <WifiOff className="w-7 h-7 text-status-red" />
            </div>
            <h2 className="text-xl font-semibold">Internet aloqasi mavjud emas</h2>
            <p className="text-sm text-muted-foreground">
              ERP faqat onlayn rejimda ishlaydi. Internetga ulanib qayta urinib ko'ring.
            </p>
            <Button onClick={() => window.location.reload()} className="w-full">
              <RefreshCw className="w-4 h-4 mr-2" />
              Qayta urinib ko'rish
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** Synchronous helper for write handlers: returns false and toasts if offline. */
export function ensureOnline(toastFn?: (msg: string) => void): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    toastFn?.("Internet aloqasi mavjud emas. Internetga ulanib qayta urinib ko'ring.");
    return false;
  }
  return true;
}
