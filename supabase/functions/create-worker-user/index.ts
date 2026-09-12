import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** One-off bootstrap: ensures the default xodim@gmail.com worker account exists. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const email = "xodim@gmail.com";
  const password = "xodim123";

  try {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);

    if (!user) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: "Xodim" },
      });
      if (error) return json({ error: error.message }, 400);
      user = data.user!;
    } else {
      await admin.auth.admin.updateUserById(user.id, { password });
    }

    await admin.from("user_roles").upsert(
      { user_id: user.id, role: "worker" },
      { onConflict: "user_id,role" },
    );

    return json({ ok: true, user_id: user.id, email });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
