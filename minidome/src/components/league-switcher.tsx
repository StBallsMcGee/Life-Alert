"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Remembers the league being viewed (cookie) and lets you switch between your leagues. */
export function LeagueSwitcher({ leagues, current, extra = "" }: { leagues: Array<{ id: string; name: string }>; current: string; extra?: string }) {
  const path = usePathname();
  useEffect(() => {
    document.cookie = `md_league=${current}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, [current]);
  if (leagues.length < 2) return null;
  return (
    <div className="-mb-1 flex gap-2 overflow-x-auto px-4 pb-2 sm:px-0 [scrollbar-width:none]">
      {leagues.map((l) => (
        <Link key={l.id} href={`${path}?league=${l.id}${extra}`} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${l.id === current ? "bg-gold-400 text-charcoal" : "bg-surface-2 text-gray-600"}`}>
          {l.name}
        </Link>
      ))}
    </div>
  );
}

/** Just remembers the league (for pages without a switcher). */
export function RememberLeague({ id }: { id: string }) {
  useEffect(() => {
    document.cookie = `md_league=${id}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }, [id]);
  return null;
}
