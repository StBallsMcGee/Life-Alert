import { callFunction, supabase } from './supabase';

export type AlertRow = {
  id: string;
  user_id: string;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
  profiles: { display_name: string; phone: string | null } | null;
  prayers: { user_id: string; profiles: { display_name: string } | null }[];
};

const ALERT_FIELDS =
  'id, user_id, note, created_at, resolved_at, profiles(display_name, phone), prayers(user_id, profiles(display_name))';

export async function fetchAlerts(): Promise<AlertRow[]> {
  const { data, error } = await supabase
    .from('alerts')
    .select(ALERT_FIELDS)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data as unknown as AlertRow[];
}

export async function fetchAlert(id: string): Promise<AlertRow | null> {
  const { data, error } = await supabase.from('alerts').select(ALERT_FIELDS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data as unknown as AlertRow | null;
}

export const sendAlert = (circleIds: string[], note: string) =>
  callFunction<{ alert_id: string; notified: number }>('send-alert', { circle_ids: circleIds, note });

export const pray = (alertId: string) => callFunction('send-prayer', { alert_id: alertId });

export async function resolveAlert(alertId: string) {
  const { error } = await supabase.from('alerts').update({ resolved_at: new Date().toISOString() }).eq('id', alertId);
  if (error) throw error;
}

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(iso).toLocaleDateString();
}
