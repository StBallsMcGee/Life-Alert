"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MinidomeLogo } from "@/components/logo";

export default function UpdatePassword() {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg({ ok: false, text: "Use at least 8 characters." });
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    window.location.replace("/");
  }
  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(ellipse_at_top,#16482b_0%,#131419_60%)] px-4">
      <form onSubmit={save} className="card !mx-0 w-full max-w-sm space-y-4 p-6">
        <MinidomeLogo size={52} className="mx-auto" />
        <h1 className="text-center text-xl font-extrabold">Choose a new password</h1>
        <div>
          <label className="label" htmlFor="pw">New password</label>
          <input id="pw" type="password" autoComplete="new-password" className="input" value={pw} onChange={(e) => setPw(e.target.value)} required minLength={8} />
        </div>
        {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`} role="alert">{msg.text}</p> : null}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </main>
  );
}
