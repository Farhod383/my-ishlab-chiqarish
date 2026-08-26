import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Roles a chief accountant (glavniy buxgalter) is allowed to assign / manage.
const CA_MANAGEABLE_ROLES = ["cashier"];

function toEmail(login: string) {
  const v = (login ?? "").trim().toLowerCase();
  if (!v) return "";
  return v.includes("@") ? v : `${v.replace(/\s+/g, "")}@mcity.local`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Avtorizatsiya talab qilinadi" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "Sessiya yaroqsiz" }, 401);
    const caller = userData.user;

    const { data: callerRoles } = await admin
      .from("user_roles").select("role").eq("user_id", caller.id);
    const roles = (callerRoles ?? []).map((r: any) => r.role as string);
    const isAdmin = roles.includes("admin");
    const isCA = roles.includes("chief_accountant");
    if (!isAdmin && !isCA) return json({ error: "Ruxsat yo'q" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    const callerName = caller.email ?? caller.id;
    const audit = (a: string, details: string) =>
      admin.from("audit_log").insert({
        actor_id: caller.id, actor_name: callerName, action: a,
        entity: "user_management", details,
      });

    const allowedRole = (role: string) =>
      isAdmin || CA_MANAGEABLE_ROLES.includes(role);

    // Roles of a target user; CA may only touch users whose roles are all manageable
    const targetRoles = async (uid: string) => {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", uid);
      return (data ?? []).map((r: any) => r.role as string);
    };
    const canTouch = async (uid: string) => {
      if (isAdmin) return true;
      const tr = await targetRoles(uid);
      return tr.length > 0 && tr.every((r) => CA_MANAGEABLE_ROLES.includes(r));
    };

    if (action === "list") {
      const wanted = isAdmin ? null : CA_MANAGEABLE_ROLES;
      let q = admin.from("user_roles").select("user_id, role");
      if (wanted) q = q.in("role", wanted);
      const { data: rows, error } = await q;
      if (error) throw error;

      const ids = [...new Set((rows ?? []).map((r: any) => r.user_id))];
      const byUser: Record<string, string[]> = {};
      for (const r of rows ?? []) (byUser[(r as any).user_id] ??= []).push((r as any).role);

      const { data: profiles } = await admin
        .from("profiles").select("id, full_name, email, department").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);

      const list: any[] = [];
      for (const id of ids) {
        const { data: au } = await admin.auth.admin.getUserById(id);
        const p = (profiles ?? []).find((x: any) => x.id === id);
        const meta = (au?.user?.user_metadata ?? {}) as any;
        list.push({
          id,
          email: au?.user?.email ?? p?.email ?? "",
          full_name: p?.full_name ?? meta.full_name ?? "",
          phone: meta.phone ?? "",
          position: meta.position ?? "",
          department: p?.department ?? meta.department ?? "",
          roles: byUser[id] ?? [],
          active: !(au?.user as any)?.banned_until || new Date((au?.user as any).banned_until) <= new Date(),
          created_at: au?.user?.created_at ?? null,
        });
      }
      list.sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
      return json({ users: list });
    }

    if (action === "create") {
      const { full_name, phone, login, password, position, department, role } = body;
      const email = toEmail(login);
      if (!email || !password || String(password).length < 6 || !full_name) {
        return json({ error: "F.I.Sh., Login va Parol (min 6) majburiy" }, 400);
      }
      if (!allowedRole(role)) return json({ error: "Bu rolni berish uchun ruxsat yo'q" }, 403);

      const { data: created, error: cErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name, phone: phone ?? "", position: position ?? "", department: department ?? "" },
      });
      if (cErr) return json({ error: cErr.message }, 400);
      const uid = created.user!.id;

      await admin.from("profiles").upsert({
        id: uid, full_name, email, department: department ?? "Kassa",
      });
      await admin.from("user_roles").upsert({ user_id: uid, role }, { onConflict: "user_id,role" });

      await audit("Yangi foydalanuvchi yaratildi", `${full_name} (${email}) — rol: ${role}`);
      return json({ ok: true, id: uid, email });
    }

    if (action === "update") {
      const { id, full_name, phone, position, department, password, role } = body;
      if (!id) return json({ error: "id majburiy" }, 400);
      if (!(await canTouch(id))) return json({ error: "Bu foydalanuvchini o'zgartirish mumkin emas" }, 403);

      const attrs: any = { user_metadata: { full_name, phone: phone ?? "", position: position ?? "", department: department ?? "" } };
      if (password) {
        if (String(password).length < 6) return json({ error: "Parol kamida 6 belgi" }, 400);
        attrs.password = password;
      }
      const { error: uErr } = await admin.auth.admin.updateUserById(id, attrs);
      if (uErr) return json({ error: uErr.message }, 400);

      await admin.from("profiles").upsert({ id, full_name, department: department ?? null });

      if (role) {
        if (!allowedRole(role)) return json({ error: "Bu rolni berish uchun ruxsat yo'q" }, 403);
        const current = await targetRoles(id);
        if (!current.includes(role)) {
          if (!isAdmin) await admin.from("user_roles").delete().eq("user_id", id);
          await admin.from("user_roles").upsert({ user_id: id, role }, { onConflict: "user_id,role" });
        }
      }

      await audit("Foydalanuvchi o'zgartirildi", `${full_name ?? id}${password ? " (parol yangilandi)" : ""}${role ? ` — rol: ${role}` : ""}`);
      return json({ ok: true });
    }

    if (action === "set_active") {
      const { id, active } = body;
      if (!id) return json({ error: "id majburiy" }, 400);
      if (id === caller.id) return json({ error: "O'zingizni deaktiv qila olmaysiz" }, 400);
      if (!(await canTouch(id))) return json({ error: "Bu foydalanuvchini o'zgartirish mumkin emas" }, 403);

      const { error: bErr } = await admin.auth.admin.updateUserById(id, {
        ban_duration: active ? "none" : "876000h",
      } as any);
      if (bErr) return json({ error: bErr.message }, 400);

      await audit(active ? "Foydalanuvchi aktivlashtirildi" : "Foydalanuvchi deaktivlashtirildi", `user_id: ${id}`);
      return json({ ok: true });
    }

    return json({ error: "Noma'lum amal" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});
