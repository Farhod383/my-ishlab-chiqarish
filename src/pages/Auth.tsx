import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Factory } from "lucide-react";

const DEMO_ACCOUNTS = [
  { email: "admin@demo.uz", label: "Administrator", color: "bg-status-red/10 border-status-red/30 text-status-red" },
  { email: "marketing@demo.uz", label: "Marketing (operator)", color: "bg-status-blue/10 border-status-blue/30 text-status-blue" },
  { email: "manager@demo.uz", label: "Manager", color: "bg-primary/10 border-primary/30 text-primary" },
  { email: "skladchi@demo.uz", label: "Skladchi", color: "bg-status-yellow/15 border-status-yellow/30 text-status-yellow" },
  { email: "taminot@demo.uz", label: "Ta'minot", color: "bg-accent/40 border-border" },
  { email: "ishchi1@demo.uz", label: "Ishchi (Aziz)", color: "bg-status-green/10 border-status-green/30 text-status-green" },
];

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [seeding, setSeeding] = useState(false);

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (user) return <Navigate to="/" replace />;

  const signIn = async (em: string, pw: string) => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: em, password: pw });
    setBusy(false);
    if (error) {
      toast.error("Kirish xatoligi: " + error.message);
      return;
    }
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
    toast.success("Ro'yxatdan o'tdingiz. Endi kirishingiz mumkin.");
  };

  const seedDemo = async () => {
    setSeeding(true);
    const { error } = await supabase.functions.invoke("seed-demo-users");
    setSeeding(false);
    if (error) { toast.error("Demo ma'lumot xatosi: " + error.message); return; }
    toast.success("Demo akkauntlar tayyor!");
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
          <h1 className="text-4xl font-bold leading-tight mb-3">Ishlab chiqarishni boshqarish<br/>oson va aniq.</h1>
          <p className="text-primary-foreground/80 text-sm max-w-md">Zakaz, bosqich, sklad va ta'minotni bitta panelda nazorat qiling. Har bir kechikish va istisno ko'rinib turadi.</p>
        </div>
        <div className="text-xs text-primary-foreground/60">© Manufacturing ERP MVP</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Tizimga kirish</CardTitle>
            <CardDescription>Demo akkaunt tanlang yoki email/parol bilan kiring.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="demo">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="demo">Demo</TabsTrigger>
                <TabsTrigger value="login">Kirish</TabsTrigger>
                <TabsTrigger value="signup">Ro'yxat</TabsTrigger>
              </TabsList>
              <TabsContent value="demo" className="space-y-3 mt-4">
                <p className="text-xs text-muted-foreground">Birinchi marta? <button onClick={seedDemo} disabled={seeding} className="text-primary underline underline-offset-2">{seeding ? "Yaratilmoqda..." : "Demo akkauntlarni yaratish"}</button></p>
                <div className="space-y-2">
                  {DEMO_ACCOUNTS.map((a) => (
                    <button
                      key={a.email}
                      disabled={busy}
                      onClick={() => signIn(a.email, "demo123456")}
                      className={`w-full text-left p-3 rounded-md border transition-all hover:shadow-sm disabled:opacity-50 ${a.color}`}
                    >
                      <div className="font-medium text-sm">{a.label}</div>
                      <div className="text-xs opacity-70">{a.email}</div>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground text-center">Parol barchasi uchun: demo123456</p>
              </TabsContent>
              <TabsContent value="login" className="space-y-3 mt-4">
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Parol</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button className="w-full" onClick={() => signIn(email, password)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kirish"}</Button>
              </TabsContent>
              <TabsContent value="signup" className="space-y-3 mt-4">
                <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div><Label>Parol (min 6 belgi)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
                <Button className="w-full" onClick={signUp} disabled={busy}>Ro'yxatdan o'tish</Button>
                <p className="text-xs text-muted-foreground">Yangi foydalanuvchilar admin tomonidan rol berilishini kutadi.</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
