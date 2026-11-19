"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { clearSelection, setSelection, submitLineup } from "@/app/actions";
import type { PoolEntry, SlotEntry } from "@/lib/data/pool";
import { fitsSlot, slotHint, slotLabel } from "@/lib/league/roster";
import { PositionTile, positionText } from "@/components/position";
import { SubjectAvatar, TeamChip, type TeamLike } from "@/components/team-chip";
import { PointsButton } from "@/components/points-breakdown";
import { Countdown, LocalTime } from "@/components/local-time";
import { Badge } from "@/components/ui";

const STATE_BADGE: Record<PoolEntry["state"], { tone: "mint" | "gold" | "slate" | "red"; label: string }> = {
  available: { tone: "mint", label: "Available" },
  selected: { tone: "gold", label: "Selected" },
  used: { tone: "slate", label: "Used" },
  unavailable: { tone: "red", label: "Unavailable" },
};

/**
 * The nine-spot lineup builder. Every pick is saved the moment it's made (the server checks the
 * One-and-Done rules, positions, byes and kickoff locks); "Submit" confirms a complete lineup.
 */
export function LineupBuilder({ leagueId, round, roundName, roundStatus, lineupStatus, allowIncomplete, slots, pool, teams }: {
  leagueId: string; round: number; roundName: string; roundStatus: string; lineupStatus: "draft" | "submitted"; allowIncomplete: boolean;
  slots: SlotEntry[]; pool: PoolEntry[]; teams: Record<string, TeamLike>;
}) {
  const [picking, setPicking] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const byKey = useMemo(() => new Map(pool.map((p) => [p.key, p])), [pool]);
  const filled = slots.filter((s) => s.key).length;
  const lockedCount = slots.filter((s) => s.locked).length;
  const pct = Math.round((filled / slots.length) * 100);
  const total = slots.reduce((t, s) => t + (s.points ?? 0), 0);
  const complete = roundStatus === "complete";
  const nextLock = slots.map((s) => (s.key && !s.locked ? byKey.get(s.key)?.kickoff : null)).filter((k): k is string => !!k).sort()[0] ?? null;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const flash = (m: { ok: boolean; text: string }) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    if (m.ok) timer.current = setTimeout(() => setMsg(null), 3000);
  };

  const choose = (slot: string, e: PoolEntry) => start(async () => {
    const r = await setSelection(leagueId, round, slot, { playerId: e.playerId, dstTeamId: e.dstTeamId });
    if (r.ok) { setPicking(null); flash({ ok: true, text: `${e.name} → ${slotLabel(slot)}. Saved.` }); }
    else flash({ ok: false, text: r.error });
  });
  const remove = (slot: string) => start(async () => {
    const r = await clearSelection(leagueId, round, slot);
    flash(r.ok ? { ok: true, text: "Spot cleared." } : { ok: false, text: r.error });
  });
  const submit = () => start(async () => {
    const r = await submitLineup(leagueId, round);
    flash(r.ok ? { ok: true, text: r.message ?? "Submitted." } : { ok: false, text: r.error });
  });

  return (
    <div className="space-y-3 pb-24">
      {/* Progress */}
      <section className="mx-3 rounded-2xl bg-surface p-4 shadow-lg shadow-black/20 sm:mx-0">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500">{roundName}</p>
            <p className="text-2xl font-black tabular-nums">{filled}<span className="text-base text-gray-500">/{slots.length}</span> <span className="text-sm font-bold text-gray-500">picked · {pct}%</span></p>
          </div>
          <div className="text-right">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-gray-500">{complete ? "Final" : "Points so far"}</p>
            <p className="text-2xl font-black tabular-nums text-gold-300">{total.toFixed(1)}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-3"><div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-orange-400 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
          <span><b className="text-gray-900">{slots.length - filled}</b> empty</span>
          <span><b className="text-gray-900">{lockedCount}</b> locked</span>
          <span><b className="text-gray-900">{filled - lockedCount}</b> still editable</span>
          {nextLock && !complete ? <span>Next lock in <b className="text-gray-900"><Countdown to={nextLock} done="now" /></b></span> : null}
          <span className="ml-auto">{lineupStatus === "submitted" ? <Badge tone="mint">✓ Submitted</Badge> : <Badge tone="amber">Not submitted</Badge>}</span>
        </div>
      </section>

      {msg ? <p className={`animate-fade-in px-4 text-sm font-semibold sm:px-0 ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="status">{msg.ok ? `✓ ${msg.text}` : msg.text}</p> : pending ? <p className="px-4 text-sm font-semibold text-gray-500 sm:px-0">Saving…</p> : null}

      {/* The nine spots */}
      <section className="mx-3 rounded-2xl bg-surface shadow-lg shadow-black/20 sm:mx-0">
        <div className="flex items-center justify-between border-b border-brand-900 bg-brand-950/50 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-brand-200">
          <span>Your nine</span><span>Each player once per postseason</span>
        </div>
        <ul className="divide-y divide-gray-100">
          {slots.map((s) => {
            const e = s.key ? byKey.get(s.key) : undefined;
            const team = e?.teamId ? teams[e.teamId] : undefined;
            const opp = e?.opponentId ? teams[e.opponentId] : undefined;
            return (
              <li key={s.slot} className={`flex items-center gap-3 px-3 py-2.5 ${picking === s.slot ? "bg-brand-950/50" : ""}`}>
                <PositionTile label={s.slot} />
                {e ? (
                  <>
                    <SubjectAvatar name={e.name} team={team} dst={!!e.dstTeamId} size={42} />
                    <div className="min-w-0 flex-1">
                      <Link href={e.playerId ? `/players/${e.playerId}` : `/games${e.gameId ? `/${e.gameId}` : ""}`} className="block truncate text-[15px] font-bold leading-tight hover:underline">{e.name}</Link>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-gray-500">
                        <span className={`font-bold ${positionText(e.position)}`}>{e.position === "DST" ? "D/ST" : e.position}</span>
                        <TeamChip team={team} size="sm" />
                        {opp ? <span>{e.home ? "vs" : "@"} {opp.abbreviation}</span> : null}
                        {e.injury ? <Badge tone="amber">{e.injury}</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-[12px]">
                        {s.locked ? <span className="font-bold text-gray-500">🔒 Locked{e.gameStatus === "final" ? " · Final" : e.gameStatus === "live" || e.gameStatus === "halftime" ? " · Live" : ""}</span>
                          : e.kickoff ? <span className="text-gray-700">Locks at kickoff · <LocalTime iso={e.kickoff} mode="kickoff" /></span> : null}
                      </div>
                    </div>
                    <div className="w-12 shrink-0 text-right">
                      {s.points !== null ? (
                        <PointsButton value={s.points} name={e.name} team={team} dst={!!e.dstTeamId} subtitle={roundName} lines={s.breakdown} status={s.scoreStatus} className={`text-[15px] font-extrabold ${s.points < 0 ? "text-red-600" : ""}`} />
                      ) : <span className="text-[15px] font-extrabold text-gray-300">–</span>}
                    </div>
                    <div className="flex w-16 shrink-0 flex-col items-stretch gap-1">
                      {!s.locked && !complete ? (
                        <>
                          <button className="rounded-full border border-gray-300 py-1 text-[11px] font-extrabold text-gray-800 active:bg-gray-100" disabled={pending} onClick={() => setPicking(s.slot)}>SWAP</button>
                          <button className="text-[10px] font-bold text-red-600" disabled={pending} onClick={() => remove(s.slot)}>Remove</button>
                        </>
                      ) : <span className="text-center text-lg text-gray-400" aria-label="Locked">🔒</span>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-gray-400">Empty · {slotHint(s.slot)}</div>
                    </div>
                    {!complete ? <button className="w-16 shrink-0 animate-pop rounded-full bg-gradient-to-r from-gold-400 to-orange-400 py-1.5 text-[11px] font-extrabold text-charcoal" disabled={pending} onClick={() => setPicking(s.slot)}>PICK</button> : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {!complete ? (
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+84px)] z-20 mx-3 flex items-center gap-3 rounded-2xl bg-surface-2/95 p-3 shadow-xl shadow-black/40 backdrop-blur sm:mx-0 lg:bottom-4">
          <p className="min-w-0 flex-1 text-[12px] text-gray-500">
            {filled < slots.length ? (allowIncomplete ? "Incomplete lineups are allowed in this league." : `Fill all ${slots.length} spots to submit.`) : lineupStatus === "submitted" ? "Submitted. You can still swap any pick until its game kicks off." : "All nine picked. Submit to confirm."}
          </p>
          <button className="btn-primary shrink-0" disabled={pending || (filled < slots.length && !allowIncomplete)} onClick={submit}>{lineupStatus === "submitted" ? "Re-submit" : "Submit lineup"}</button>
        </div>
      ) : null}

      {picking ? <PlayerPicker slot={picking} pool={pool} teams={teams} pending={pending} error={msg && !msg.ok ? msg.text : null} onPick={(e) => choose(picking, e)} onClose={() => { setPicking(null); setMsg(null); }} /> : null}
    </div>
  );
}

type Show = "available" | "all" | "used";

function PlayerPicker({ slot, pool, teams, pending, error, onPick, onClose }: {
  slot: string; pool: PoolEntry[]; teams: Record<string, TeamLike>; pending: boolean; error: string | null; onPick: (e: PoolEntry) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("available");
  const [team, setTeam] = useState("");
  const [pos, setPos] = useState("");
  const [hideInjured, setHideInjured] = useState(false);
  const [closing, setClosing] = useState(false);
  const close = () => { setClosing(true); setTimeout(onClose, 190); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const eligible = pool.filter((p) => fitsSlot(p.position, slot));
  const teamIds = [...new Set(eligible.map((p) => p.teamId).filter(Boolean))] as string[];
  const positions = [...new Set(eligible.map((p) => p.position))];
  const needle = q.trim().toLowerCase();
  const list = eligible.filter((p) =>
    (show === "all" || (show === "available" ? p.state === "available" || p.state === "selected" : p.state === "used"))
    && (!team || p.teamId === team) && (!pos || p.position === pos)
    && (!hideInjured || !p.injury)
    && (!needle || p.name.toLowerCase().includes(needle) || (p.teamId && teams[p.teamId]?.abbreviation.toLowerCase() === needle)));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`Pick a player for ${slotLabel(slot)}`}>
      <button className={`absolute inset-0 bg-black/50 ${closing ? "animate-fade-out" : "animate-fade-in"}`} aria-label="Close" onClick={close} />
      <div className={`relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] shadow-2xl sm:rounded-2xl ${closing ? "animate-slide-down sm:animate-pop-out" : "animate-slide-up sm:animate-pop"}`}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300 sm:hidden" />
        <div className="flex items-center gap-3 px-4 pb-2 pt-3">
          <PositionTile label={slot} />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-tight">Pick your {slotLabel(slot)}</h2>
            <p className="text-xs text-gray-500">{slotHint(slot)} · {list.length} shown</p>
          </div>
          <button className="grid h-9 w-9 place-items-center rounded-full text-2xl leading-none text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={close}>×</button>
        </div>
        <div className="space-y-2 border-b border-gray-100 px-4 pb-3">
          <input className="input" placeholder="Search players or team (e.g. BUF)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="flex flex-wrap gap-1.5">
            {(["available", "all", "used"] as Show[]).map((s) => (
              <button key={s} onClick={() => setShow(s)} className={`rounded-full px-3 py-1 text-xs font-bold capitalize transition-colors ${show === s ? "bg-gold-400 text-charcoal" : "bg-surface-3 text-gray-700"}`}>{s === "used" ? "Previously used" : s}</button>
            ))}
            {positions.length > 1 ? (
              <select className="rounded-full bg-surface-3 px-2 py-1 text-xs font-bold text-gray-700" value={pos} onChange={(e) => setPos(e.target.value)} aria-label="Position">
                <option value="">All positions</option>
                {positions.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : null}
            <select className="rounded-full bg-surface-3 px-2 py-1 text-xs font-bold text-gray-700" value={team} onChange={(e) => setTeam(e.target.value)} aria-label="NFL team">
              <option value="">All teams</option>
              {teamIds.map((t) => teams[t]).filter(Boolean).sort((a, b) => a!.abbreviation.localeCompare(b!.abbreviation)).map((t) => <option key={t!.id} value={t!.id}>{t!.abbreviation}</option>)}
            </select>
            <label className="flex items-center gap-1 rounded-full bg-surface-3 px-2 py-1 text-xs font-bold text-gray-700">
              <input type="checkbox" checked={hideInjured} onChange={(e) => setHideInjured(e.target.checked)} className="accent-gold-400" /> No injury tag
            </label>
          </div>
          {error ? <p className="text-sm font-semibold text-red-600" role="alert">{error}</p> : null}
        </div>
        <ul className="flex-1 divide-y divide-gray-100 overflow-y-auto overscroll-contain">
          {list.length === 0 ? <li className="px-4 py-8 text-center text-sm text-gray-500">No players match. Try &quot;All&quot; to see who&apos;s unavailable and why.</li> : null}
          {list.map((p) => {
            const t = p.teamId ? teams[p.teamId] : undefined;
            const opp = p.opponentId ? teams[p.opponentId] : undefined;
            const b = STATE_BADGE[p.state];
            const can = p.state === "available";
            return (
              <li key={p.key}>
                <button disabled={!can || pending} onClick={() => onPick(p)} className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${can ? "active:bg-gray-50 hover:bg-white/5" : "opacity-60"}`}>
                  <SubjectAvatar name={p.name} team={t} dst={!!p.dstTeamId} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold">{p.name}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-gray-500">
                      <span className={`font-bold ${positionText(p.position)}`}>{p.position === "DST" ? "D/ST" : p.position}</span>
                      <TeamChip team={t} size="sm" />
                      {opp ? <span className="truncate">{p.home ? "vs" : "@"} {opp.abbreviation} · <LocalTime iso={p.kickoff!} mode="kickoff" /></span> : null}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                      <Badge tone={b.tone}>{p.note ?? b.label}</Badge>
                      {p.injury && p.state !== "unavailable" ? <Badge tone="amber">{p.injury}{p.injuryNote ? ` · ${p.injuryNote}` : ""}</Badge> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[15px] font-extrabold tabular-nums">{p.seasonPoints.toFixed(1)}</span>
                    <span className="block text-[10px] text-gray-500">{p.gamesPlayed ? `last ${p.lastPoints?.toFixed(1)}` : "no games yet"}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
