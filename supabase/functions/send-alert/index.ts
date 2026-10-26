// Sends a "please pray for me" alert to every member of the chosen circles.
import { adminClient, corsHeaders, displayName, json, sendPush, tokensFor, userClient } from '../_shared/util.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = userClient(req);
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) return json({ error: 'Not signed in' }, 401);

  const { circle_ids, note } = (await req.json()) as { circle_ids?: string[]; note?: string };
  if (!Array.isArray(circle_ids) || circle_ids.length === 0) {
    return json({ error: 'Pick at least one circle' }, 400);
  }

  const admin = adminClient();

  // Guard against accidental double-sends.
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await admin
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since);
  if ((count ?? 0) > 0) {
    return json({ error: 'Your circle was just notified. They are on it.' }, 429);
  }

  // Inserts go through the user's client so RLS checks circle membership.
  const { data: alert, error: alertError } = await supabase
    .from('alerts')
    .insert({ user_id: user.id, note: note?.trim() || null })
    .select('id')
    .single();
  if (alertError) return json({ error: alertError.message }, 400);

  const { error: targetError } = await supabase
    .from('alert_circles')
    .insert(circle_ids.map((circle_id) => ({ alert_id: alert.id, circle_id })));
  if (targetError) {
    await admin.from('alerts').delete().eq('id', alert.id);
    return json({ error: targetError.message }, 400);
  }

  const { data: members, error: membersError } = await admin
    .from('circle_members')
    .select('user_id')
    .in('circle_id', circle_ids)
    .neq('user_id', user.id);
  if (membersError) return json({ error: membersError.message }, 500);

  const recipients = [...new Set(members.map((m) => m.user_id as string))];
  const name = await displayName(admin, user.id);
  const tokens = await tokensFor(admin, recipients);

  // Kept discreet: this text can show on a lock screen.
  await sendPush(
    tokens.map((to) => ({
      to,
      title: `${name} needs backup 🙏`,
      body: `${name} is asking for prayer right now. Tap to pray and reach out.`,
      data: { alertId: alert.id },
    })),
  );

  return json({ alert_id: alert.id, notified: recipients.length });
});
