"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseServer, supabaseServiceRole } from "@/lib/supabase/server";
import { withClient } from "@/lib/db/pg";
import { correctStats, resetSampleSeason, runSync } from "@/lib/sync/run";
import { providerFromEnv, setMockAnchor } from "@/lib/sync/provider-factory";

/**
 * Every action calls a database function as the signed-in user. The database checks permissions
 * and the game rules again; nothing here is trusted on its own.
 */
export type ActionResult<T = undefined> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

const uuid = z.string().uuid();
const SLOT = z.string().regex(/^(QB|RB|WR|TE|FLEX|DST|K)\d*$/);

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Invalid input." };
  const msg = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.";
  return { ok: false, error: msg };
}

async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const sb = await supabaseServer();
  const { data, error } = await sb.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function refresh(...paths: string[]) {
  for (const p of ["/", ...paths]) revalidatePath(p, p === "/" ? "layout" : "page");
}

/* ------------------------------------------------------------------ leagues */

const leagueSchema = z.object({
  name: z.string().trim().min(2, "League name must be at least 2 characters.").max(60),
  description: z.string().max(500).default(""),
  maxMembers: z.coerce.number().int().min(2, "A league has at least 2 members.").max(20, "A league has at most 20 members."),
});

export async function createLeague(input: z.input<typeof leagueSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const v = leagueSchema.parse(input);
    const id = await rpc<string>("create_league", { p_name: v.name, p_description: v.description, p_max_members: v.maxMembers });
    refresh("/leagues");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().max(500).optional(),
  max_members: z.coerce.number().int().min(2).max(20).optional(),
  allow_incomplete: z.boolean().optional(),
  roster_config: z.record(z.enum(["QB", "RB", "WR", "TE", "FLEX", "DST", "K"]), z.number().int().min(0).max(4)).optional(),
});

export async function updateLeague(leagueId: string, settings: z.input<typeof settingsSchema>): Promise<ActionResult> {
  try {
    await rpc("update_league_settings", { p_league: uuid.parse(leagueId), p_settings: settingsSchema.parse(settings) });
    refresh(`/leagues/${leagueId}`, `/leagues/${leagueId}/manage`, "/lineup");
    return { ok: true, message: "Settings saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function createInvitation(leagueId: string, kind: "link" | "code" | "email", opts: { email?: string; expiresHours?: number | null; maxUses?: number | null }): Promise<ActionResult<{ token: string }>> {
  try {
    const token = await rpc<string>("create_invitation", {
      p_league: uuid.parse(leagueId), p_kind: z.enum(["link", "code", "email"]).parse(kind),
      p_email: kind === "email" ? z.string().email("Enter a valid email address.").parse(opts.email) : null,
      p_expires_hours: opts.expiresHours ?? null, p_max_uses: opts.maxUses ?? null,
    });
    refresh(`/leagues/${leagueId}/manage`);
    return { ok: true, data: { token } };
  } catch (e) {
    return fail(e);
  }
}

export async function revokeInvitation(leagueId: string, invitationId: string): Promise<ActionResult> {
  try {
    await rpc("revoke_invitation", { p_invitation: uuid.parse(invitationId) });
    refresh(`/leagues/${leagueId}/manage`);
    return { ok: true, message: "Invitation cancelled." };
  } catch (e) {
    return fail(e);
  }
}

export async function joinLeague(token: string): Promise<ActionResult<{ id: string }>> {
  try {
    const t = z.string().trim().min(6, "Enter the invitation code.").max(80).parse(token);
    const id = await rpc<string>("join_league", { p_token: t });
    refresh("/leagues");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e);
  }
}

export async function removeMember(leagueId: string, userId: string, reason: string): Promise<ActionResult> {
  try {
    await rpc("remove_member", { p_league: uuid.parse(leagueId), p_user: uuid.parse(userId), p_reason: reason || null });
    refresh(`/leagues/${leagueId}`, `/leagues/${leagueId}/manage`);
    return { ok: true, message: "Member removed." };
  } catch (e) {
    return fail(e);
  }
}

export async function leaveLeague(leagueId: string): Promise<ActionResult> {
  try {
    await rpc("leave_league", { p_league: uuid.parse(leagueId) });
  } catch (e) {
    return fail(e);
  }
  refresh("/leagues");
  redirect("/leagues");
}

/* ------------------------------------------------------------------ lineups */

function lineupPaths(leagueId: string) {
  return ["/lineup", "/my-players", "/standings", `/leagues/${leagueId}`];
}

export async function setSelection(leagueId: string, round: number, slot: string, pick: { playerId?: string | null; dstTeamId?: string | null }): Promise<ActionResult> {
  try {
    await rpc("set_selection", {
      p_league: uuid.parse(leagueId), p_round: z.number().int().min(1).max(8).parse(round), p_slot: SLOT.parse(slot),
      p_player: pick.playerId ? uuid.parse(pick.playerId) : null, p_dst_team: pick.dstTeamId ? uuid.parse(pick.dstTeamId) : null,
    });
    refresh(...lineupPaths(leagueId));
    return { ok: true, message: "Saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function clearSelection(leagueId: string, round: number, slot: string): Promise<ActionResult> {
  try {
    await rpc("clear_selection", { p_league: uuid.parse(leagueId), p_round: round, p_slot: SLOT.parse(slot) });
    refresh(...lineupPaths(leagueId));
    return { ok: true, message: "Removed." };
  } catch (e) {
    return fail(e);
  }
}

export async function submitLineup(leagueId: string, round: number): Promise<ActionResult> {
  try {
    await rpc("submit_lineup", { p_league: uuid.parse(leagueId), p_round: round });
    refresh(...lineupPaths(leagueId));
    return { ok: true, message: "Lineup submitted. Picks can still be swapped until each player's game kicks off." };
  } catch (e) {
    return fail(e);
  }
}

/* ------------------------------------------------------------------ account */

export async function updateProfile(input: { displayName: string; username: string; prefs: Record<string, boolean> }): Promise<ActionResult> {
  try {
    await rpc("update_profile", { p_display_name: input.displayName, p_username: input.username, p_prefs: input.prefs });
    refresh("/profile");
    return { ok: true, message: "Profile saved." };
  } catch (e) {
    return fail(e);
  }
}

export async function markNotificationsRead(): Promise<void> {
  await rpc("mark_notifications_read", {});
  refresh("/profile");
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/login");
}

/**
 * Deletes the account and, with it, the person's memberships, lineups and picks (the database
 * cascades). Commissioners must hand over or finish their leagues first.
 */
export async function deleteAccount(confirmText: string): Promise<ActionResult> {
  try {
    if (confirmText.trim().toUpperCase() !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
    const sb = await supabaseServer();
    const { data } = await sb.auth.getUser();
    if (!data.user) return { ok: false, error: "Sign in first." };
    const { data: owned } = await sb.from("leagues").select("id").eq("commissioner_id", data.user.id);
    if (owned && owned.length) return { ok: false, error: "You are a league commissioner. Leagues keep their commissioner, so this account can't be deleted while it runs a league." };
    const { error } = await supabaseServiceRole().auth.admin.deleteUser(data.user.id);
    if (error) throw error;
    await sb.auth.signOut();
  } catch (e) {
    return fail(e);
  }
  redirect("/login?deleted=1");
}

/* ------------------------------------------------------------------ site administrator */

async function requireSiteAdmin(): Promise<string> {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) throw new Error("Sign in first.");
  const { data: p } = await sb.from("profiles").select("is_site_admin").eq("id", data.user.id).maybeSingle();
  if (!p?.is_site_admin) throw new Error("Administrators only.");
  return data.user.id;
}

export async function adminSyncNow(full: boolean): Promise<ActionResult> {
  try {
    await requireSiteAdmin();
    const r = await withClient(async (db) => runSync(db, await providerFromEnv(db), { full }));
    refresh("/admin", "/games", "/lineup");
    return r.ok ? { ok: true, message: `Sync complete: ${r.detail} Next run in ${r.intervalSeconds}s (${r.mode}).` } : { ok: false, error: r.detail };
  } catch (e) {
    return fail(e);
  }
}

/** Sample season only: restart the mock postseason so Wild Card kicks off in N minutes. */
export async function adminRestartSample(minutesUntilKickoff: number): Promise<ActionResult> {
  try {
    await requireSiteAdmin();
    if ((process.env.NFL_DATA_PROVIDER ?? "mock") !== "mock") throw new Error("Only available with the sample (mock) data provider.");
    const m = z.number().int().min(-60 * 24 * 40).max(60 * 24 * 30).parse(minutesUntilKickoff);
    const r = await withClient(async (db) => {
      await resetSampleSeason(db);
      await setMockAnchor(db, new Date(Date.now() + m * 60_000));
      return runSync(db, await providerFromEnv(db), { full: true });
    });
    refresh("/admin", "/games", "/lineup", "/leagues");
    return r.ok ? { ok: true, message: `Sample postseason restarted. ${r.detail}` } : { ok: false, error: r.detail };
  } catch (e) {
    return fail(e);
  }
}

const statsSchema = z.record(z.string().regex(/^[a-zA-Z0-9_]+$/), z.number().finite());

export async function adminCorrectStats(input: { kind: "player" | "dst"; subjectId: string; gameId: string; stats: Record<string, number>; reason: string }): Promise<ActionResult> {
  try {
    const actor = await requireSiteAdmin();
    await withClient((db) => correctStats(db, {
      kind: z.enum(["player", "dst"]).parse(input.kind), subjectId: uuid.parse(input.subjectId), gameId: uuid.parse(input.gameId),
      stats: statsSchema.parse(input.stats), reason: z.string().trim().min(5, "Give a reason (at least 5 characters).").parse(input.reason), actor,
    }));
    refresh("/admin", "/standings", "/games");
    return { ok: true, message: "Correction saved; points and standings recalculated." };
  } catch (e) {
    return fail(e);
  }
}

export async function adminVoidSelection(selectionId: string, reason: string): Promise<ActionResult> {
  try {
    await rpc("admin_void_selection", { p_selection: uuid.parse(selectionId), p_reason: reason });
    refresh("/admin");
    return { ok: true, message: "Selection released (audited)." };
  } catch (e) {
    return fail(e);
  }
}
