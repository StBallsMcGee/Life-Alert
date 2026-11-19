"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createInvitation, createLeague, joinLeague, leaveLeague, removeMember, revokeInvitation, updateLeague } from "@/app/actions";
import { LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui";

function useAction() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const Message = () => (msg ? <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="status">{msg.ok ? `✓ ${msg.text}` : msg.text}</p> : null);
  return { pending, start, setMsg, Message };
}

export function CreateLeagueForm() {
  const router = useRouter();
  const { pending, start, setMsg, Message } = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [size, setSize] = useState(6);
  return (
    <form className="card space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await createLeague({ name, description, maxMembers: size });
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      router.push(`/leagues/${r.data!.id}/manage?created=1`);
    }); }}>
      <div>
        <label className="label" htmlFor="ln">League name</label>
        <input id="ln" className="input" required minLength={2} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} placeholder="Sunday Funday Playoff Pool" />
      </div>
      <div>
        <label className="label" htmlFor="ld">Description (optional)</label>
        <textarea id="ld" className="input min-h-[72px]" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Bragging rights and the trophy on the mantel." />
      </div>
      <div>
        <label className="label" htmlFor="ls">Members: {size}</label>
        <input id="ls" type="range" min={2} max={20} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-full accent-gold-400" />
        <p className="mt-1 text-xs text-gray-500">2–20 people, 6 by default. You can change this later.</p>
      </div>
      <div className="rounded-xl bg-surface-2 p-3 text-xs text-gray-600">
        <b className="text-gray-900">Rules:</b> One-and-Done · Half PPR scoring · 9 spots (QB, 2 RB, 2 WR, TE, FLEX, D/ST, K) · picks lock at each player&apos;s kickoff. Scoring and roster settings freeze when the playoffs begin.
      </div>
      <Message />
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating…" : "Create league"}</button>
    </form>
  );
}

export function JoinForm() {
  const router = useRouter();
  const { pending, start, setMsg, Message } = useAction();
  const [code, setCode] = useState("");
  return (
    <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const raw = code.trim();
      const token = raw.includes("/join/") ? decodeURIComponent(raw.split("/join/")[1]!.split(/[?#]/)[0]!) : raw;
      const r = await joinLeague(token);
      if (!r.ok) return setMsg({ ok: false, text: r.error });
      router.push(`/leagues/${r.data!.id}?joined=1`);
    }); }}>
      <input className="input min-w-0 flex-1 font-mono uppercase tracking-widest" placeholder="Invitation code or link" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Invitation code" />
      <button className="btn-primary" disabled={pending || code.trim().length < 6}>{pending ? "Joining…" : "Join"}</button>
      <div className="w-full"><Message /></div>
    </form>
  );
}

export function LeaveLeagueButton({ leagueId }: { leagueId: string }) {
  const { pending, start, setMsg, Message } = useAction();
  return (
    <div className="space-y-2">
      <button className="btn-ghost text-red-600" disabled={pending} onClick={() => {
        if (!confirm("Leave this league? You can rejoin with a new invitation.")) return;
        start(async () => { const r = await leaveLeague(leagueId); if (r && !r.ok) setMsg({ ok: false, text: r.error }); });
      }}>Leave league</button>
      <Message />
    </div>
  );
}

export function SettingsForm({ leagueId, initial, frozen, memberCount }: {
  leagueId: string; frozen: boolean; memberCount: number;
  initial: { name: string; description: string; max_members: number; allow_incomplete: boolean; roster_config: Record<string, number> };
}) {
  const { pending, start, setMsg, Message } = useAction();
  const [v, setV] = useState(initial);
  const POS = ["QB", "RB", "WR", "TE", "FLEX", "DST", "K"] as const;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const payload = frozen ? { name: v.name, description: v.description, max_members: v.max_members } : v;
      const r = await updateLeague(leagueId, payload);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
    }); }}>
      <div>
        <label className="label" htmlFor="sn">League name</label>
        <input id="sn" className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={60} />
      </div>
      <div>
        <label className="label" htmlFor="sd">Description</label>
        <textarea id="sd" className="input min-h-[64px]" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={500} />
      </div>
      <div>
        <label className="label" htmlFor="ss">Maximum members: {v.max_members}</label>
        <input id="ss" type="range" min={Math.max(2, memberCount)} max={20} value={v.max_members} onChange={(e) => setV({ ...v, max_members: Number(e.target.value) })} className="w-full accent-gold-400" />
      </div>
      <fieldset disabled={frozen} className="space-y-3 rounded-xl border border-gray-200 p-3 disabled:opacity-60">
        <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-gray-500">Roster &amp; lineup rules {frozen ? "· frozen (playoffs have begun)" : ""}</legend>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {POS.map((p) => (
            <label key={p} className="text-center text-[11px] font-bold text-gray-500">
              {p === "DST" ? "D/ST" : p}
              <input type="number" min={0} max={4} className="input mt-1 px-1 text-center" value={v.roster_config[p] ?? 0} onChange={(e) => setV({ ...v, roster_config: { ...v.roster_config, [p]: Math.max(0, Math.min(4, Number(e.target.value) || 0)) } })} />
            </label>
          ))}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1 accent-gold-400" checked={v.allow_incomplete} onChange={(e) => setV({ ...v, allow_incomplete: e.target.checked })} />
          <span><b>Allow incomplete lineups</b><span className="block text-xs text-gray-500">Members may submit with empty spots (empty spots score 0).</span></span>
        </label>
        <p className="text-xs text-gray-500">Scoring: Half PPR (version 1). Lock rule: each player locks at their own kickoff. Tie-breaker: Super Bowl, then Conference, Divisional, Wild Card scores.</p>
      </fieldset>
      <Message />
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save settings"}</button>
    </form>
  );
}

export interface InvitationRow { id: string; kind: string; hint: string; email: string | null; expires_at: string | null; max_uses: number | null; current_uses: number; revoked_at: string | null; created_at: string }

export function InvitePanel({ leagueId, invitations, siteUrl }: { leagueId: string; invitations: InvitationRow[]; siteUrl: string }) {
  const { pending, start, setMsg, Message } = useAction();
  const [kind, setKind] = useState<"link" | "code" | "email">("link");
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState(168);
  const [maxUses, setMaxUses] = useState<number | "">("");
  const [fresh, setFresh] = useState<{ kind: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const shareText = fresh ? (fresh.kind === "code" ? fresh.token : `${siteUrl}/join/${fresh.token}`) : "";
  const now = Date.now();
  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => {
        const r = await createInvitation(leagueId, kind, { email, expiresHours: hours || null, maxUses: maxUses === "" ? null : maxUses });
        if (!r.ok) return setMsg({ ok: false, text: r.error });
        setMsg(null);
        setCopied(false);
        setFresh({ kind, token: r.data!.token });
        setEmail("");
      }); }}>
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-50 p-1 text-xs font-semibold">
          {(["link", "code", "email"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg py-2 capitalize ${kind === k ? "bg-gray-200 text-gray-900" : "text-gray-500"}`}>{k === "email" ? "Email invite" : k === "code" ? "Code" : "Link"}</button>
          ))}
        </div>
        {kind === "email" ? <input className="input" type="email" required placeholder="friend@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /> : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-bold text-gray-500">Expires
            <select className="input mt-1" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={24}>in 1 day</option><option value={168}>in 7 days</option><option value={720}>in 30 days</option><option value={2160}>in 90 days</option>
            </select>
          </label>
          {kind !== "email" ? (
            <label className="text-xs font-bold text-gray-500">Max uses
              <input className="input mt-1" type="number" min={1} max={50} placeholder="Unlimited" value={maxUses} onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : "")} />
            </label>
          ) : <p className="self-end pb-2 text-xs text-gray-500">Works once, for that email only.</p>}
        </div>
        <Message />
        <button className="btn-primary w-full" disabled={pending}>{pending ? "Creating…" : `Create ${kind === "email" ? "email invitation" : kind}`}</button>
      </form>
      {fresh ? (
        <div className="animate-pop rounded-2xl border border-gold-400/50 bg-gold-400/10 p-3">
          <p className="text-xs font-extrabold uppercase tracking-wide text-gold-300">{fresh.kind === "code" ? "Invitation code" : "Invitation link"} · shown once</p>
          <p className={`mt-1 break-all font-mono ${fresh.kind === "code" ? "text-2xl font-black tracking-[0.25em]" : "text-sm"}`}>{shareText}</p>
          {fresh.kind === "email" ? <p className="mt-1 text-xs text-gray-600">Send this link to the invited address (automatic invitation emails arrive with notifications in Phase 4).</p> : null}
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn-secondary min-h-[34px] px-3 py-1 text-xs" onClick={async () => { try { await navigator.clipboard.writeText(shareText); setCopied(true); } catch { setCopied(false); } }}>{copied ? "✓ Copied" : "Copy"}</button>
            {typeof navigator !== "undefined" && "share" in navigator ? <button type="button" className="btn-secondary min-h-[34px] px-3 py-1 text-xs" onClick={() => navigator.share({ title: "Join my MINIDOME league", text: fresh.kind === "code" ? `Join my league on THE MINIDOME with code ${shareText}` : undefined, url: fresh.kind === "code" ? undefined : shareText }).catch(() => undefined)}>Share</button> : null}
          </div>
          <p className="mt-2 text-[11px] text-gray-500">For security only a fingerprint is stored, so copy it now. You can always create another.</p>
        </div>
      ) : null}
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100">
        {invitations.length === 0 ? <li className="px-3 py-3 text-sm text-gray-500">No invitations yet.</li> : invitations.map((i) => {
          const expired = i.expires_at && new Date(i.expires_at).getTime() < now;
          const used = i.max_uses !== null && i.current_uses >= i.max_uses;
          const state = i.revoked_at ? <Badge tone="red">Cancelled</Badge> : expired ? <Badge>Expired</Badge> : used ? <Badge>Used up</Badge> : <Badge tone="mint">Active</Badge>;
          return (
            <li key={i.id} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold capitalize">{i.kind}{i.email ? ` · ${i.email}` : ""} <span className="font-mono text-xs text-gray-500">{i.hint}…</span></span>
                <span className="block text-[11px] text-gray-500">{i.current_uses}{i.max_uses ? `/${i.max_uses}` : ""} used{i.expires_at ? <> · expires <LocalTime iso={i.expires_at} mode="date" /></> : ""}</span>
              </span>
              {state}
              {!i.revoked_at && !expired && !used ? <button className="text-xs font-bold text-red-600" disabled={pending} onClick={() => start(async () => { const r = await revokeInvitation(leagueId, i.id); setMsg(r.ok ? { ok: true, text: "Invitation cancelled." } : { ok: false, text: r.error }); })}>Revoke</button> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RemoveMemberButton({ leagueId, userId, name }: { leagueId: string; userId: string; name: string }) {
  const { pending, start, setMsg, Message } = useAction();
  return (
    <span className="text-right">
      <button className="text-xs font-bold text-red-600" disabled={pending} onClick={() => {
        const reason = prompt(`Remove ${name} from the league? Optional reason (kept in the audit log):`);
        if (reason === null) return;
        start(async () => { const r = await removeMember(leagueId, userId, reason); setMsg(r.ok ? { ok: true, text: "Removed." } : { ok: false, text: r.error }); });
      }}>Remove</button>
      <Message />
    </span>
  );
}
