// Seed demo users with roles. Idempotent.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const DEMO_USERS = [
  { email: 'admin@demo.uz', password: 'demo123456', full_name: 'Admin Foydalanuvchi', department: 'Boshqaruv', role: 'admin' },
  { email: 'marketing@demo.uz', password: 'demo123456', full_name: 'Operator Marketing', department: 'Marketing', role: 'marketing' },
  { email: 'manager@demo.uz', password: 'demo123456', full_name: `Manager Yo'riqchi`, department: 'Boshqaruv', role: 'manager' },
  { email: 'skladchi@demo.uz', password: 'demo123456', full_name: `Sklad Mas'uli`, department: 'Sklad', role: 'warehouse' },
  { email: 'taminot@demo.uz', password: 'demo123456', full_name: `Ta'minot Xodimi`, department: `Ta'minot`, role: 'supply' },
  { email: 'ishchi1@demo.uz', password: 'demo123456', full_name: 'Aziz Karimov', department: 'Sex 1', role: 'worker' },
  { email: 'ishchi2@demo.uz', password: 'demo123456', full_name: 'Bobur Toshmatov', department: 'Sex 1', role: 'worker' },
  { email: 'ishchi3@demo.uz', password: 'demo123456', full_name: 'Sardor Aliyev', department: 'Sex 2', role: 'worker' },
  { email: 'ishchi4@demo.uz', password: 'demo123456', full_name: 'Dilshod Raxmatullayev', department: 'Sex 2', role: 'worker' },
  { email: 'ishchi5@demo.uz', password: 'demo123456', full_name: 'Jasur Nazarov', department: 'Sex 3', role: 'worker' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const results: any[] = [];

    for (const u of DEMO_USERS) {
      // Check if exists
      const { data: list } = await admin.auth.admin.listUsers();
      let user = list.users.find((x) => x.email === u.email);
      if (!user) {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
        if (error) { results.push({ email: u.email, error: error.message }); continue; }
        user = data.user!;
      }
      // Upsert profile
      await admin.from('profiles').upsert({
        id: user.id, full_name: u.full_name, department: u.department, email: u.email,
      });
      // Upsert role
      await admin.from('user_roles').upsert(
        { user_id: user.id, role: u.role as any },
        { onConflict: 'user_id,role' },
      );
      results.push({ email: u.email, ok: true });
    }

    // Seed sample orders if none
    const { count } = await admin.from('orders').select('*', { count: 'exact', head: true });
    if ((count ?? 0) === 0) {
      const { data: clients } = await admin.from('clients').select('id, name').limit(5);
      const { data: workers } = await admin.from('profiles').select('id').in('email', ['ishchi1@demo.uz','ishchi2@demo.uz','ishchi3@demo.uz']);
      const { data: products } = await admin.from('products').select('id, name, unit');
      const today = new Date();
      const addDays = (d: number) => { const x = new Date(today); x.setDate(x.getDate()+d); return x.toISOString().slice(0,10); };

      const orders = [
        { order_number: 'Z-2025-001', client_id: clients?.[0]?.id, product_name: 'Konveyer ramasi', quantity: 10, priority: 'exception', status: 'in_progress', deadline: addDays(-2), queue_position: 1 },
        { order_number: 'Z-2025-002', client_id: clients?.[1]?.id, product_name: 'Metall shkaf', quantity: 25, priority: 'normal', status: 'delayed', deadline: addDays(-5), queue_position: 2 },
        { order_number: 'Z-2025-003', client_id: clients?.[4]?.id, product_name: 'Quvur tutqich', quantity: 50, priority: 'normal', status: 'completed', deadline: addDays(-10), queue_position: 3 },
        { order_number: 'Z-2025-004', client_id: clients?.[2]?.id, product_name: 'Elevatorli konveyer', quantity: 5, priority: 'normal', status: 'pending', deadline: addDays(15), queue_position: 4 },
        { order_number: 'Z-2025-005', client_id: clients?.[3]?.id, product_name: 'Filtr korpusi', quantity: 15, priority: 'normal', status: 'in_progress', deadline: addDays(7), queue_position: 5 },
      ];
      const { data: insertedOrders } = await admin.from('orders').insert(orders).select();

      const stageNames = ['Kesish','Egish','Payvandlash','Tozalash',`Bo'yash`,`Yig'ish`,'Tekshirish'];
      const stageDays = [1,1,2,1,2,2,1];
      for (const o of insertedOrders ?? []) {
        let completedCount = 0;
        if (o.status === 'completed') completedCount = 7;
        else if (o.status === 'in_progress') completedCount = 3;
        else if (o.status === 'delayed') completedCount = 2;

        const stages = stageNames.map((name, i) => {
          const isCompleted = i < completedCount;
          const isActive = i === completedCount && o.status !== 'completed' && o.status !== 'pending';
          const isDelayed = isActive && o.status === 'delayed';
          return {
            order_id: o.id, name, stage_order: i+1, norm_days: stageDays[i],
            qc_required: [2,5,6].includes(i),
            qc_passed: isCompleted && [2,5,6].includes(i) ? true : null,
            status: isCompleted ? 'completed' : isDelayed ? 'delayed' : isActive ? 'in_progress' : 'pending',
            worker_id: (isCompleted || isActive) && workers?.[i % (workers?.length||1)] ? workers[i % workers.length].id : null,
            worker_changed_comment: i === 3 && isCompleted ? 'Ishchi almashtirildi: Bobur -> Sardor' : null,
            started_at: (isCompleted || isActive) ? new Date(Date.now() - (7-i)*86400000).toISOString() : null,
            finished_at: isCompleted ? new Date(Date.now() - (6-i)*86400000).toISOString() : null,
          };
        });
        await admin.from('order_stages').insert(stages);

        // Order parts
        const parts = (products ?? []).slice(0,5).map((p, i) => ({
          order_id: o.id, product_id: p.id, part_name: p.name, unit: p.unit,
          norm_qty: [4,16,16,0.5,8][i] * o.quantity,
          actual_qty: o.status === 'pending' ? 0 : o.status === 'completed' ? [4,16,16,0.5,8][i] * o.quantity * (i===4 ? 1.15 : 1) : [4,16,16,0.5,8][i] * o.quantity * 0.6,
        }));
        await admin.from('order_parts').insert(parts);

        // Audit log
        await admin.from('audit_log').insert({
          actor_name: 'Tizim', action: 'Zakaz yaratildi',
          entity: 'order', order_id: o.id,
          details: o.order_number + ` zakazi tizimda ro'yxatga olindi`,
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
