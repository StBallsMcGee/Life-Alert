import { supabase, type Circle } from './supabase';

export type CircleWithMembers = Circle & {
  circle_members: { user_id: string; profiles: { display_name: string } | null }[];
};

export async function fetchCircles(): Promise<CircleWithMembers[]> {
  const { data, error } = await supabase
    .from('circles')
    .select('id, name, invite_code, created_by, circle_members(user_id, profiles(display_name))')
    .order('created_at');
  if (error) throw error;
  return data as unknown as CircleWithMembers[];
}

export async function createCircle(name: string) {
  const { error } = await supabase.rpc('create_circle', { circle_name: name });
  if (error) throw error;
}

export async function joinCircle(code: string) {
  const { error } = await supabase.rpc('join_circle', { code });
  if (error) throw error;
}

export async function leaveCircle(circleId: string, userId: string) {
  const { error } = await supabase.from('circle_members').delete().match({ circle_id: circleId, user_id: userId });
  if (error) throw error;
}
