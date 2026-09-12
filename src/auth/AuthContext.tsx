import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "marketing" | "manager" | "warehouse" | "supply" | "otk" | "hr" | "cashier" | "chief_accountant" | "engineer" | "worker";

// Role inheritance (mirrors the backend has_role() function):
// chief_accountant (Glavniy buxgalter) automatically has every cashier permission.
const ROLE_INHERITS: Partial<Record<AppRole, AppRole[]>> = {
  chief_accountant: ["cashier"],
};

function expandRoles(roles: AppRole[]): AppRole[] {
  const out = new Set<AppRole>(roles);
  for (const r of roles) (ROLE_INHERITS[r] ?? []).forEach((x) => out.add(x));
  return [...out];
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (r: AppRole | AppRole[]) => boolean;
  refreshRoles: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null, session: null, roles: [], loading: true,
  signOut: async () => {}, hasRole: () => false, refreshRoles: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoles = async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadRoles(s.user.id), 0);
      } else {
        setRoles([]);
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadRoles(s.user.id);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (user) {
      await supabase.from("audit_log").insert({
        actor_id: user.id, actor_name: user.email, action: "Tizimdan chiqish",
        entity: "auth", details: `Logout: ${user.email}`,
      });
    }
    await supabase.auth.signOut();
    setRoles([]);
  };

  const hasRole = (r: AppRole | AppRole[]) => {
    const arr = Array.isArray(r) ? r : [r];
    if (roles.includes("admin")) return true;
    const effective = expandRoles(roles);
    return arr.some((x) => effective.includes(x));
  };

  const refreshRoles = async () => { if (user) await loadRoles(user.id); };

  return (
    <Ctx.Provider value={{ user, session, roles, loading, signOut, hasRole, refreshRoles }}>
      {children}
    </Ctx.Provider>
  );
}
