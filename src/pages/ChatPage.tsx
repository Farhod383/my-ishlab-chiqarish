import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthContext";
import { useI18n } from "@/i18n/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageSquare, Plus, Send, Globe, User as UserIcon, Mic, Square, Video, Paperclip } from "lucide-react";
import { toast } from "sonner";

interface Conversation {
  id: string;
  is_global: boolean;
  title: string | null;
  participants?: { user_id: string; profile?: { full_name: string; email?: string } }[];
}
interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string | null;
  body: string;
  created_at: string;
  media_url?: string | null;
  media_type?: string | null;
}

export default function ChatPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [convs, setConvs] = useState<Conversation[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [newPartner, setNewPartner] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  const load = async () => {
    const [{ data: c }, { data: parts }, { data: profs }] = await Promise.all([
      supabase.from("chat_conversations").select("*"),
      supabase.from("chat_participants").select("conversation_id, user_id"),
      supabase.from("profiles").select("id, full_name, email, department"),
    ]);
    setProfiles(profs ?? []);
    const profMap: Record<string, any> = {};
    (profs ?? []).forEach((p) => { profMap[p.id] = p; });
    const convsWithParts = (c ?? []).map((cv: any) => ({
      ...cv,
      participants: (parts ?? []).filter((p) => p.conversation_id === cv.id).map((p) => ({ user_id: p.user_id, profile: profMap[p.user_id] })),
    }));
    setConvs(convsWithParts);
    if (!active && convsWithParts.length) {
      const global = convsWithParts.find((cv) => cv.is_global);
      setActive(global?.id ?? convsWithParts[0].id);
    }
  };

  useEffect(() => { load(); }, []);

  const loadMsgs = async (convId: string) => {
    const { data } = await supabase.from("chat_messages").select("*").eq("conversation_id", convId).order("created_at");
    setMsgs(data ?? []);
    setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
  };

  useEffect(() => {
    if (!active) return;
    loadMsgs(active);
    const ch = supabase
      .channel(`chat-${active}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages", filter: `conversation_id=eq.${active}` }, (payload) => {
        setMsgs((prev) => [...prev, payload.new as Message]);
        setTimeout(() => scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight), 50);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [active]);

  const send = async () => {
    if (!text.trim() || !active || !user) return;
    const myProfile = profiles.find((p) => p.id === user.id);
    const senderName = myProfile?.full_name || user.email;
    const body = text.trim();
    setText("");
    const { error } = await supabase.from("chat_messages").insert({
      conversation_id: active, sender_id: user.id, sender_name: senderName, body,
    });
    if (error) { toast.error(error.message); setText(body); }
  };

  const startPrivate = async () => {
    if (!user || !newPartner) return;
    // find existing 1-1 (non-global) with both members
    const candidate = convs.find((c) => !c.is_global
      && c.participants?.length === 2
      && c.participants.some((p) => p.user_id === user.id)
      && c.participants.some((p) => p.user_id === newPartner));
    if (candidate) { setActive(candidate.id); setOpenNew(false); return; }

    const { data: conv, error } = await supabase.from("chat_conversations").insert({
      is_global: false, title: null,
    }).select().single();
    if (error || !conv) { toast.error(error?.message ?? "Xatolik"); return; }
    await supabase.from("chat_participants").insert([
      { conversation_id: conv.id, user_id: user.id },
      { conversation_id: conv.id, user_id: newPartner },
    ]);
    await load();
    setActive(conv.id);
    setOpenNew(false);
    setNewPartner("");
  };

  const labelOf = (c: Conversation) => {
    if (c.is_global) return t.chat.global;
    if (c.title) return c.title;
    const other = c.participants?.find((p) => p.user_id !== user?.id);
    return other?.profile?.full_name ?? other?.profile?.email ?? "Suhbat";
  };

  const sortedConvs = useMemo(() => {
    return [...convs].sort((a, b) => Number(b.is_global) - Number(a.is_global));
  }, [convs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><MessageSquare className="h-6 w-6" /> {t.chat.title}</h1>
          <p className="text-sm text-muted-foreground">Realtime · global va shaxsiy</p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-1" />{t.chat.new}</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t.chat.new}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={newPartner} onValueChange={setNewPartner}>
                <SelectTrigger><SelectValue placeholder={t.chat.select} /></SelectTrigger>
                <SelectContent>
                  {profiles.filter((p) => p.id !== user?.id).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email} {p.department && `(${p.department})`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={startPrivate} disabled={!newPartner} className="w-full">{t.common.create}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid lg:grid-cols-[280px_1fr] gap-4 h-[70vh]">
        <Card className="overflow-hidden flex flex-col">
          <CardHeader className="py-3"><CardTitle className="text-sm">{t.chat.title}</CardTitle></CardHeader>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {sortedConvs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActive(c.id)}
                  className={`w-full text-left p-2.5 rounded-md text-sm flex items-center gap-2 transition-colors ${active === c.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"}`}
                >
                  {c.is_global ? <Globe className="h-4 w-4 shrink-0" /> : <UserIcon className="h-4 w-4 shrink-0" />}
                  <span className="truncate">{labelOf(c)}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="py-3 border-b">
            <CardTitle className="text-sm">{active ? labelOf(convs.find((c) => c.id === active)!) : "—"}</CardTitle>
          </CardHeader>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/20">
            {msgs.length === 0 && <p className="text-center text-sm text-muted-foreground py-12">{t.chat.empty}</p>}
            {msgs.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${mine ? "bg-primary text-primary-foreground" : "bg-card border"}`}>
                    {!mine && <div className="text-[10px] font-semibold opacity-70 mb-0.5">{m.sender_name ?? "—"}</div>}
                    <div className="whitespace-pre-wrap break-words">{m.body}</div>
                    <div className={`text-[10px] mt-1 ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {new Date(m.created_at).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t p-3 flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t.chat.placeholder}
              disabled={!active}
            />
            <Button onClick={send} disabled={!text.trim() || !active}><Send className="h-4 w-4" /></Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
