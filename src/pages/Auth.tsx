import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useI18n } from "@/i18n/context";
import { toast } from "sonner";
import { Loader2, Factory } from "lucide-react";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (user) return <Navigate to="/" replace />;

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error(`${t.auth.loginErr}: ${error.message}`); return; }
    nav("/", { replace: true });
  };

  const signUp = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.auth.signupOk);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary-foreground/15 flex items-center justify-center">
            <Factory className="h-6 w-6" />
          </div>
          <div className="font-bold text-lg">Manufacturing ERP</div>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-3">{t.auth.heroTitle}</h1>
          <p className="text-primary-foreground/80 text-sm max-w-md">{t.auth.heroSubtitle}</p>
        </div>
        <div className="text-xs text-primary-foreground/60">© Manufacturing ERP</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{t.auth.title}</CardTitle>
              <CardDescription>{t.auth.subtitle}</CardDescription>
            </div>
            <LanguageSwitcher />
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">{t.auth.loginTab}</TabsTrigger>
                <TabsTrigger value="signup">{t.auth.signupTab}</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="space-y-3 mt-4">
                <div><Label>{t.auth.email}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></div>
                <div><Label>{t.auth.password}</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
                <Button className="w-full" onClick={signIn} disabled={busy || !email || !password}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t.auth.login}
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 mt-4">
                <div><Label>{t.auth.email}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>{t.auth.password} (min 6)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button className="w-full" onClick={signUp} disabled={busy || !email || password.length < 6}>{t.auth.signup}</Button>
                <p className="text-xs text-muted-foreground">{t.auth.signupHint}</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
