import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export type Notification = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

/** Notifies users on every device they've registered: the native app and the web app. */
export async function notifyUsers(admin: SupabaseClient, userIds: string[], notification: Notification) {
  if (userIds.length === 0) return;
  await Promise.all([sendExpoPush(admin, userIds, notification), sendWebPush(admin, userIds, notification)]);
}

/** Sends through Expo's push service, 100 at a time. */
async function sendExpoPush(admin: SupabaseClient, userIds: string[], notification: Notification) {
  const { data, error } = await admin.from('push_tokens').select('token').in('user_id', userIds);
  if (error) throw error;
  const messages = data.map((r) => ({
    ...notification,
    to: r.token as string,
    sound: 'default',
    priority: 'high',
    channelId: 'alerts',
  }));
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    if (!res.ok) console.error('Expo push failed', res.status, await res.text());
  }
}

/**
 * Sends Web Push to home-screen web app installs. web-push builds and encrypts
 * the request; we send it with fetch because its own sender relies on Node's
 * https module.
 */
async function sendWebPush(admin: SupabaseClient, userIds: string[], notification: Notification) {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const subject = Deno.env.get('VAPID_SUBJECT');
  if (!publicKey || !privateKey || !subject) {
    console.warn('VAPID keys not set; skipping web push');
    return;
  }

  const { data, error } = await admin
    .from('web_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (error) throw error;

  const payload = JSON.stringify(notification);
  await Promise.all(
    data.map(async (sub) => {
      try {
        const req = webpush.generateRequestDetails(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          { TTL: 60 * 60, urgency: 'high', vapidDetails: { subject, publicKey, privateKey } },
        );
        const res = await fetch(req.endpoint, { method: req.method, headers: req.headers, body: req.body });
        // 404/410 mean the browser dropped this subscription.
        if (res.status === 404 || res.status === 410) {
          await admin.from('web_push_subscriptions').delete().eq('endpoint', sub.endpoint);
        } else if (!res.ok) {
          console.error('Web push failed', res.status, await res.text());
        }
      } catch (e) {
        console.error('Web push error', e);
      }
    }),
  );
}

export async function displayName(admin: SupabaseClient, userId: string) {
  const { data } = await admin.from('profiles').select('display_name').eq('id', userId).single();
  return data?.display_name?.trim() || 'A brother';
}
