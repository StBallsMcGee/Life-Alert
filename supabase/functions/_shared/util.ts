import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** A client that acts as the calling user, so row level security applies. */
export function userClient(req: Request): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
}

/** A service-role client, used only to look up push tokens and names. */
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

export type PushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** Sends notifications through Expo's push service, 100 at a time. */
export async function sendPush(messages: PushMessage[]) {
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100).map((m) => ({
      ...m,
      sound: 'default',
      priority: 'high',
      channelId: 'alerts',
    }));
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) console.error('Expo push failed', res.status, await res.text());
  }
}

export async function tokensFor(admin: SupabaseClient, userIds: string[]) {
  if (userIds.length === 0) return [];
  const { data, error } = await admin.from('push_tokens').select('token').in('user_id', userIds);
  if (error) throw error;
  return data.map((r) => r.token as string);
}

export async function displayName(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from('profiles').select('display_name').eq('id', userId).single();
  return data?.display_name?.trim() || 'A brother';
}
