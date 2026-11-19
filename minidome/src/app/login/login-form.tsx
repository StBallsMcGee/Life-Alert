"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Mode = "signin" | "signup" | "link" | "reset";

export function LoginForm({ next, initialError, initialInfo }: { next: string; initialError: string | null; initialInfo: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [info, setInfo] = useState<string | null>(initialInfo);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    const sb = supabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(next);
        router.refresh();
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Use a password of at least 8 characters.");
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: callback(), data: { display_name: name.trim() } } });
        if (error) throw error;
        if (data.session) {
          router.replace(next);
          router.refresh();
        } else setInfo("Almost there: check your email and tap the link to verify your address.");
      } else if (mode === "link") {
        const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: callback() } });
        if (error) throw error;
        setInfo("Check your email for a sign-in link.");
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password` });
        if (error) throw error;
        setInfo("If that email has an account, a password reset link is on its way.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "apple") {
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({ provider, options: { redirectTo: callback() } });
    if (error) setError(error.message);
  }

  const tab = (m: Mode, label: string) => (
    <button type="button" onClick={() => { setMode(m); setError(null); setInfo(null); }} className={`rounded-lg py-2 transition-colors ${mode === m ? "bg-gray-200 text-gray-900" : "text-gray-500"}`}>{label}</button>
  );

  return (
    <div className="card !mx-0 space-y-4 p-6">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-gray-50 p-1 text-xs font-semibold">
        {tab("signin", "Sign in")}
        {tab("signup", "Create account")}
        {tab("link", "Email link")}
      </div>
      <div className="grid gap-2">
        <button type="button" onClick={() => oauth("apple")} className="btn border border-gray-200 bg-white text-charcoal hover:brightness-95">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden><path d="M16.4 12.6c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.2-2.8.8-3.5.8s-1.8-.8-3-.8C6.9 7.2 5.4 8.1 4.6 9.6c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8s1.8.8 3 .8c1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.7-4zM14 5.6c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z" /></svg>
          Continue with Apple
        </button>
        <button type="button" onClick={() => oauth("google")} className="btn-secondary">
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.5-.2-2.2H12v4.2h6c-.3 1.4-1 2.5-2.2 3.3v2.7h3.5c2.1-1.9 3.3-4.7 3.3-8z" /><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.4-2-6.3-4.6H2.1v2.8C3.9 20.5 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.7 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7.1H2.1C1.4 8.6 1 10.2 1 12s.4 3.4 1.1 4.9l3.6-2.8z" /><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.1-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.5 2.1 7.1l3.6 2.8c.9-2.6 3.4-4.5 6.3-4.5z" /></svg>
          Continue with Google
        </button>
      </div>
      <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-wide text-gray-400"><span className="h-px flex-1 bg-gray-200" />or with email<span className="h-px flex-1 bg-gray-200" /></div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" ? (
          <div>
            <label className="label" htmlFor="name">Display name</label>
            <input id="name" required maxLength={40} autoComplete="nickname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode === "signin" || mode === "signup" ? (
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" type="password" required minLength={mode === "signup" ? 8 : undefined} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
        {info ? <p className="text-sm text-emerald-600" role="status">{info}</p> : null}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "link" ? "Send sign-in link" : "Send reset link"}
        </button>
      </form>
      <button type="button" onClick={() => setMode(mode === "reset" ? "signin" : "reset")} className="block w-full text-center text-xs text-gray-500 hover:text-gray-900">
        {mode === "reset" ? "Back to sign in" : "Forgot your password?"}
      </button>
    </div>
  );
}
