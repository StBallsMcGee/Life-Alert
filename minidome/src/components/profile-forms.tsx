"use client";
import { useState, useTransition } from "react";
import { deleteAccount, markNotificationsRead, updateProfile } from "@/app/actions";

const PREFS: Array<[string, string]> = [
  ["inApp", "In-app notifications"],
  ["email", "Email notifications"],
  ["deadlines", "Lineup deadline reminders"],
  ["locks", "Selection locked"],
  ["touchdowns", "Touchdowns by my players"],
  ["injuries", "Injury updates for my players"],
  ["standings", "Leaderboard position changes"],
  ["corrections", "Scoring corrections"],
  ["rounds", "Round results & champion"],
];

export function ProfileForm({ initial }: { initial: { displayName: string; username: string; prefs: Record<string, boolean> } }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await updateProfile(v);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Saved." } : { ok: false, text: r.error });
    }); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="dn">Display name</label><input id="dn" className="input" maxLength={40} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} /></div>
        <div><label className="label" htmlFor="un">Username</label><input id="un" className="input lowercase" maxLength={24} value={v.username} onChange={(e) => setV({ ...v, username: e.target.value.toLowerCase() })} /></div>
      </div>
      <fieldset>
        <legend className="label">Notifications</legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {PREFS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm">
              <input type="checkbox" className="accent-gold-400" checked={v.prefs[k] ?? true} onChange={(e) => setV({ ...v, prefs: { ...v.prefs, [k]: e.target.checked } })} />{label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-gray-500">In-app notifications are live now; email and push delivery arrive in Phase 4 and will follow these choices.</p>
      </fieldset>
      {msg ? <p className={`text-sm font-semibold ${msg.ok ? "text-emerald-700" : "text-red-600"}`} role="status">{msg.ok ? `✓ ${msg.text}` : msg.text}</p> : null}
      <button className="btn-primary" disabled={pending}>{pending ? "Saving…" : "Save profile"}</button>
    </form>
  );
}

export function MarkReadButton() {
  const [pending, start] = useTransition();
  return <button className="link text-xs" disabled={pending} onClick={() => start(() => markNotificationsRead())}>{pending ? "…" : "Mark all read"}</button>;
}

export function DeleteAccount() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-600">Permanently deletes your account, league memberships and picks. This can&apos;t be undone.</p>
      <div className="flex gap-2">
        <input className="input max-w-[12rem]" placeholder="Type DELETE" value={text} onChange={(e) => setText(e.target.value)} aria-label="Type DELETE to confirm" />
        <button className="btn-danger" disabled={pending || text.trim().toUpperCase() !== "DELETE"} onClick={() => start(async () => { const r = await deleteAccount(text); if (r && !r.ok) setMsg(r.error); })}>Delete account</button>
      </div>
      {msg ? <p className="text-sm text-red-600" role="alert">{msg}</p> : null}
    </div>
  );
}
