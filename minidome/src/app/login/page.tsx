import { MinidomeLogo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/";
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_top,#16482b_0%,#131419_62%)] px-4 py-10">
      {/* Yard lines fading into the dark, like walking out of the tunnel. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-72 opacity-25 [background:repeating-linear-gradient(90deg,transparent_0,transparent_46px,rgba(255,255,255,.55)_46px,rgba(255,255,255,.55)_48px)] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative w-full max-w-sm animate-page-in">
        <div className="mb-7 text-center">
          <MinidomeLogo size={84} className="mx-auto mb-3 drop-shadow-[0_6px_24px_rgba(249,194,46,0.35)]" />
          <h1 className="leading-none"><span className="block text-xs font-extrabold tracking-[0.5em] text-gold-300">THE</span><span className="text-4xl font-black italic tracking-tight">MINIDOME</span></h1>
          <p className="mt-2 text-sm text-gray-500">NFL playoff One-and-Done with your friends</p>
        </div>
        <LoginForm next={next} initialError={sp.error ? "That link has expired or was already used. Please try again." : null} initialInfo={sp.deleted ? "Your account has been deleted." : null} />
        <p className="mt-6 text-center text-xs text-gray-500">Leagues are private. Join one with an invitation from its commissioner, or start your own.</p>
      </div>
    </main>
  );
}
