import Link from "next/link";
import { MinidomeLogo } from "@/components/logo";
import { supabaseServer } from "@/lib/supabase/server";
import { JoinButton } from "./join-button";

export const metadata = { title: "Join a league" };
export const dynamic = "force-dynamic";

/** The page behind an invitation link or code: see the league, sign in (or sign up), join. */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const sb = await supabaseServer();
  const [{ data: info }, { data: auth }] = await Promise.all([sb.rpc("invitation_info", { p_token: code }), sb.auth.getUser()]);
  const inv = (Array.isArray(info) ? info[0] : null) as { league_name: string | null; commissioner: string | null; members: number; max_members: number; valid: boolean; problem: string | null } | null;
  const next = `/join/${encodeURIComponent(code)}`;

  let body: React.ReactNode;
  if (!inv || !inv.league_name) {
    body = (
      <>
        <h1 className="text-xl font-extrabold">This invitation isn&apos;t valid</h1>
        <p className="text-sm text-gray-600">Check the link or code, or ask your commissioner for a new one.</p>
        <Link href="/leagues" className="btn-secondary w-full">Go to my leagues</Link>
      </>
    );
  } else {
    body = (
      <>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gold-300">You&apos;re invited</p>
          <h1 className="text-2xl font-black leading-tight">{inv.league_name}</h1>
          <p className="mt-1 text-sm text-gray-500">Commissioner: {inv.commissioner ?? "—"} · {inv.members}/{inv.max_members} members</p>
        </div>
        <ul className="space-y-1.5 rounded-xl bg-surface-2 p-3 text-[13px] text-gray-700">
          <li>🏈 Pick 9 players for each playoff round</li>
          <li>☝️ Use each player only once all postseason</li>
          <li>🏆 Most total points after the Super Bowl wins</li>
        </ul>
        {!inv.valid ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{inv.problem}</p>
        ) : auth.user ? (
          <JoinButton code={code} />
        ) : (
          <div className="grid gap-2">
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary w-full">Sign in or create an account to join</Link>
            <p className="text-center text-xs text-gray-500">You&apos;ll come straight back here afterwards.</p>
          </div>
        )}
      </>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(ellipse_at_top,#16482b_0%,#131419_60%)] px-4 py-10">
      <div className="mx-auto w-full max-w-sm animate-page-in">
        <div className="mb-6 text-center">
          <MinidomeLogo size={64} className="mx-auto mb-2 drop-shadow-[0_6px_24px_rgba(249,194,46,0.35)]" />
          <p className="text-sm font-black italic tracking-tight text-gray-500"><span className="mr-1 text-[10px] not-italic tracking-[0.3em] text-gold-300">THE</span>MINIDOME</p>
        </div>
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">{body}</div>
      </div>
    </main>
  );
}
