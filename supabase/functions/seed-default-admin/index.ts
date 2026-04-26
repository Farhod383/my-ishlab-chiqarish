import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL = "hamdullayevfarhod18@gmail.com";
const PASSWORD = "admin123";
const ROLES = ["admin", "marketing", "manager", "warehouse", "supply"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Check if user already exists
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    let user = list?.users.find((u) => u.email?.toLowerCase() === EMAIL.toLowerCase());

    if (!user) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: "Farhod Hamdullayev" },
      });
      if (error) throw error;
      user = created.user!;
    } else {
      // Reset password to ensure it matches
      await admin.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
    }

    // Ensure profile
    await admin.from("profiles").upsert({
      id: user.id,
      full_name: "Farhod Hamdullayev",
      email: EMAIL,
      department: "Administration",
    });

    // Ensure roles
    for (const role of ROLES) {
      await admin.from("user_roles").upsert(
        { user_id: user.id, role },
        { onConflict: "user_id,role" },
      );
    }

    return new Response(
      JSON.stringify({ ok: true, email: EMAIL }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: String(e?.message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
