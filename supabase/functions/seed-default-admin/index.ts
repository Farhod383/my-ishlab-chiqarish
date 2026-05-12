import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Role = "admin" | "marketing" | "manager" | "warehouse" | "supply" | "otk" | "hr" | "cashier" | "engineer";

const USERS: Array<{
  email: string;
  password: string;
  full_name: string;
  department: string;
  roles: Role[];
}> = [
  { email: "admin@gmail.com",     password: "admin123",     full_name: "Administrator",   department: "Administration", roles: ["admin"] },
  { email: "marketing@gmail.com", password: "marketing123", full_name: "Marketing User",  department: "Marketing",      roles: ["marketing"] },
  { email: "sklad@gmail.com",     password: "sklad123",     full_name: "Skladchi",        department: "Sklad",          roles: ["warehouse"] },
  { email: "taminot@gmail.com",   password: "taminot123",   full_name: "Ta'minotchi",     department: "Ta'minot",       roles: ["supply"] },
  { email: "otk@gmail.com",       password: "otk123",       full_name: "OTK Inspektor",   department: "OTK",            roles: ["otk"] },
  { email: "manager@gmail.com",   password: "manager123",   full_name: "Nachalnik",       department: "Boshqaruv",      roles: ["manager"] },
  { email: "cashier@gmail.com",   password: "cashier123",   full_name: "Kassir",          department: "Kassa",          roles: ["cashier"] },
  { email: "engineer@gmail.com",  password: "engineer123",  full_name: "Injener",         department: "Injeneriya",     roles: ["engineer"] },
];

const DEMO_EMAILS = [
  "admin@demo.uz", "marketing@demo.uz", "sklad@demo.uz", "taminot@demo.uz",
  "otk@demo.uz", "manager@demo.uz", "worker@demo.uz",
  "hamdullayevfarhod18@gmail.com",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Fetch existing users (paginate)
    const allUsers: any[] = [];
    let page = 1;
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw error;
      allUsers.push(...(data?.users ?? []));
      if (!data?.users || data.users.length < 200) break;
      page++;
    }

    // Remove demo users
    const removed: string[] = [];
    for (const u of allUsers) {
      const em = u.email?.toLowerCase();
      if (em && DEMO_EMAILS.map(e => e.toLowerCase()).includes(em)) {
        await admin.auth.admin.deleteUser(u.id);
        removed.push(em);
      }
    }

    const created: string[] = [];
    const updated: string[] = [];

    for (const spec of USERS) {
      let user = allUsers.find(u => u.email?.toLowerCase() === spec.email.toLowerCase()
        && !DEMO_EMAILS.map(e => e.toLowerCase()).includes(u.email?.toLowerCase()));

      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({
          email: spec.email,
          password: spec.password,
          email_confirm: true,
          user_metadata: { full_name: spec.full_name },
        });
        if (error) throw new Error(`create ${spec.email}: ${error.message}`);
        user = data.user!;
        created.push(spec.email);
      } else {
        await admin.auth.admin.updateUserById(user.id, {
          password: spec.password,
          email_confirm: true,
          user_metadata: { full_name: spec.full_name },
        });
        updated.push(spec.email);
      }

      // Profile
      await admin.from("profiles").upsert({
        id: user.id,
        full_name: spec.full_name,
        email: spec.email,
        department: spec.department,
      });

      // Clear existing roles, then insert specified roles
      await admin.from("user_roles").delete().eq("user_id", user.id);
      for (const role of spec.roles) {
        await admin.from("user_roles").upsert(
          { user_id: user.id, role },
          { onConflict: "user_id,role" },
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, created, updated, removed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
