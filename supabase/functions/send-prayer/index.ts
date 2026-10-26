// Records "I'm praying" on an alert and lets the person who sent it know.
import { adminClient, corsHeaders, displayName, json, sendPush, tokensFor, userClient } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = userClient(req);
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return json({ error: 'Not signed in' }, 401);

  const { alert_id } = (await req.json()) as { alert_id?: string };
  if (!alert_id) return json({ error: 'Missing alert_id' }, 400);

  // RLS only allows praying for alerts this user can see.
  const { data: inserted, error } = await supabase
    .from('prayers')
    .upsert({ alert_id, user_id: user.id }, { onConflict: 'alert_id,user_id', ignoreDuplicates: true })
    .select('alert_id');
  if (error) return json({ error: error.message }, 400);

  // Already prayed earlier: don't notify twice.
  if (!inserted || inserted.length === 0) return json({ ok: true });

  const admin = adminClient();
  const { data: alert } = await admin.from('alerts').select('user_id').eq('id', alert_id).single();
  if (alert && alert.user_id !== user.id) {
    const name = await displayName(admin, user.id);
    const tokens = await tokensFor(admin, [alert.user_id]);
    await sendPush(
      tokens.map((to) => ({
        to,
        title: `${name} is praying for you`,
        body: 'You are not alone. Stand firm.',
        data: { alertId: alert_id },
      })),
    );
  }

  return json({ ok: true });
});
