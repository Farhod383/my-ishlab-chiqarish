import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "./AuthContext";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: AppRole[] }) {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!user) return <Navigate to="/auth" state={{ from: location }} replace />;
  if (roles && !hasRole(roles)) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Ruxsat yo'q</h2>
          <p className="text-muted-foreground">Bu sahifani ko'rish uchun sizda yetarli huquq yo'q.</p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
