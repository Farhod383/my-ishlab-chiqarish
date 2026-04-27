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
import { Loader2, Factory, ArrowLeft } from "lucide-react";

type SignupStep = "email" | "code" | "password";

export default function Auth() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const [signupEmail, setSignupEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<SignupStep>("email");

  if (loading) return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  if (user) return <Navigate to="/" replace />;

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) { toast.error(`${t.auth.loginErr}: ${error.message}`); return; }
    nav("/", { replace: true });
  };

  const sendCode = async () => {
    if (!signupEmail) return;
    setBusy(true);
    // shouldCreateUser: true → signs up + sends 6-digit OTP
    const { error } = await supabase.auth.signInWithOtp({
      email: signupEmail,
      options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.auth.codeSent);
    setStep("code");
  };

  const verifyCode = async () => {
    if (otp.length < 6) return;
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: signupEmail, token: otp, type: "email" });
    setBusy(false);
    if (error) { toast.error(t.auth.invalidCode); return; }
    setStep("password");
  };

  const completeSignup = async () => {
    if (newPassword.length < 6) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(t.auth.signupOk);
    nav("/", { replace: true });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-to-br from-primary via-primary/90 to-primary/70 text-primary-foreground">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary-foreground/15 flex items-center justify-center">
            <Factory className="h-6 w-6" />
          </div>
          <div className="font-bold text-lg">MCITY</div>
        </div>
        <div>
          <h1 className="text-4xl font-bold leading-tight mb-3">{t.auth.heroTitle}</h1>
          <p className="text-primary-foreground/80 text-sm max-w-md">{t.auth.heroSubtitle}</p>
        </div>
        <div className="text-xs text-primary-foreground/60">MCITY</div>
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
            <Tabs defaultValue="login" onValueChange={() => setStep("email")}>
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
                {step === "email" && (
                  <>
                    <div><Label>{t.auth.email}</Label><Input type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} autoComplete="email" /></div>
                    <Button className="w-full" onClick={sendCode} disabled={busy || !signupEmail}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t.auth.sendCode}
                    </Button>
                  </>
                )}
                {step === "code" && (
                  <>
                    <p className="text-sm text-muted-foreground">{t.auth.codeSent}: <span className="font-medium text-foreground">{signupEmail}</span></p>
                    <div>
                      <Label>{t.auth.code}</Label>
                      <Input
                        inputMode="numeric"
                        maxLength={6}
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                        placeholder="••••••"
                        className="text-center text-lg tracking-[0.5em] font-mono"
                      />
                    </div>
                    <Button className="w-full" onClick={verifyCode} disabled={busy || otp.length < 6}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t.auth.verify}
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => { setStep("email"); setOtp(""); }}>
                      <ArrowLeft className="h-3 w-3 mr-1" /> {t.auth.backToEmail}
                    </Button>
                  </>
                )}
                {step === "password" && (
                  <>
                    <div><Label>{t.auth.setPassword} (min 6)</Label><Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" /></div>
                    <Button className="w-full" onClick={completeSignup} disabled={busy || newPassword.length < 6}>
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t.auth.completeSignup}
                    </Button>
                  </>
                )}
                <p className="text-xs text-muted-foreground">{t.auth.signupHint}</p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
