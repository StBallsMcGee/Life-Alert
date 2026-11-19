import { Nav } from "@/components/nav";
import { getContext } from "@/lib/data/context";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getContext();
  const league = ctx.leagues.find((l) => l.id === ctx.rememberedLeague) ?? ctx.leagues[0];
  return (
    <>
      <Nav leagueName={league?.name ?? null} isAdmin={!!ctx.profile?.is_site_admin} userName={ctx.profile?.display_name || ctx.user.email || ""} unread={ctx.unread} />
      <main className="mx-auto max-w-5xl overflow-x-clip pb-28 sm:px-4 lg:pb-12">{children}</main>
    </>
  );
}
