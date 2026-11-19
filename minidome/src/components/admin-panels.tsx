"use client";
import { useMemo, useState, useTransition } from "react";
import { adminCorrectStats, adminRestartSample, adminSyncNow, adminVoidSelection } from "@/app/actions";

function useRun() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error ?? "Failed." });
  });
  const Message = () => (msg ? <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="status">{msg.text}</p> : null);
  return { pending, run, Message };
}

export function SyncControls({ sample }: { sample: boolean }) {
  const { pending, run, Message } = useRun();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => run(() => adminSyncNow(false))}>{pending ? "Working…" : "Sync now"}</button>
        <button className="btn-secondary" disabled={pending} onClick={() => run(() => adminSyncNow(true))}>Full refresh (players + corrections)</button>
      </div>
      {sample ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-900">Sample postseason controls (test data only)</p>
          <p className="mb-2 text-xs text-amber-800">Restarts the simulated postseason: games, stats, points and lineups in sample leagues are cleared; leagues and members stay.</p>
          <div className="flex flex-wrap gap-2">
            {[["Wild Card in 10 min", 10], ["in 1 hour", 60], ["in 2 days", 2880], ["WC under way (−30 min)", -30], ["WC finished (−4 days)", -5760]].map(([label, m]) => (
              <button key={String(m)} className="btn-secondary min-h-[34px] px-3 py-1 text-xs" disabled={pending} onClick={() => { if (confirm(`Restart the sample postseason (${label})?`)) run(() => adminRestartSample(m as number)); }}>{label}</button>
            ))}
          </div>
        </div>
      ) : null}
      <Message />
    </div>
  );
}

const FIELDS = ["passYds", "passTd", "passInt", "pass2pt", "rushYds", "rushTd", "rush2pt", "rec", "recYds", "recTd", "rec2pt", "fumLost", "xpMade", "xpMissed", "fgMade0_39", "fgMade40_49", "fgMade50p", "fgMissed"];
const DST_FIELDS = ["sacks", "ints", "fumRec", "defTd", "stTd", "safeties", "blockedKicks", "xpReturns", "twoPtReturns", "pointsAllowed"];

export interface StatOption { kind: "player" | "dst"; subjectId: string; gameId: string; label: string; stats: Record<string, number> }

export function StatCorrection({ games, options }: { games: Array<{ id: string; label: string }>; options: StatOption[] }) {
  const { pending, run, Message } = useRun();
  const [game, setGame] = useState(games[0]?.id ?? "");
  const choices = useMemo(() => options.filter((o) => o.gameId === game), [options, game]);
  const [subject, setSubject] = useState("");
  const current = choices.find((o) => `${o.kind}:${o.subjectId}` === subject);
  const [values, setValues] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const fields = current?.kind === "dst" ? DST_FIELDS : FIELDS;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <select className="input" value={game} onChange={(e) => { setGame(e.target.value); setSubject(""); }} aria-label="Game">
          {games.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}
        </select>
        <select className="input" value={subject} onChange={(e) => { setSubject(e.target.value); const o = choices.find((x) => `${x.kind}:${x.subjectId}` === e.target.value); setValues(o?.stats ?? {}); }} aria-label="Player or D/ST">
          <option value="">Choose a player or D/ST…</option>
          {choices.map((o) => <option key={`${o.kind}:${o.subjectId}`} value={`${o.kind}:${o.subjectId}`}>{o.label}</option>)}
        </select>
      </div>
      {current ? (
        <>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {fields.map((f) => (
              <label key={f} className="text-[10px] font-bold text-gray-500">{f}
                <input type="number" className="input mt-0.5 px-2 py-1 text-sm" value={values[f] ?? 0} onChange={(e) => setValues({ ...values, [f]: Number(e.target.value) })} />
              </label>
            ))}
          </div>
          <input className="input" placeholder="Reason (required, kept in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn-primary" disabled={pending || reason.trim().length < 5} onClick={() => run(() => adminCorrectStats({ kind: current.kind, subjectId: current.subjectId, gameId: current.gameId, stats: Object.fromEntries(Object.entries(values).filter(([, v]) => v !== 0)), reason }))}>Save correction</button>
        </>
      ) : null}
      <Message />
    </div>
  );
}

export function VoidSelection({ rows }: { rows: Array<{ id: string; label: string }> }) {
  const { pending, run, Message } = useRun();
  const [id, setId] = useState(rows[0]?.id ?? "");
  const [reason, setReason] = useState("");
  if (rows.length === 0) return <p className="text-sm text-gray-500">No picks are in cancelled or suspended games. Nothing needs an exception.</p>;
  return (
    <div className="space-y-2">
      <select className="input" value={id} onChange={(e) => setId(e.target.value)}>{rows.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
      <input className="input" placeholder="Reason (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="btn-danger" disabled={pending || reason.trim().length < 5} onClick={() => run(() => adminVoidSelection(id, reason))}>Release this pick (audited)</button>
      <Message />
    </div>
  );
}
