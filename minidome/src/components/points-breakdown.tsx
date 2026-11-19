"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BreakdownLine } from "@/lib/scoring/engine";
import { SubjectAvatar, type TeamLike } from "@/components/team-chip";

function fmt(n: number) {
  return Number.isInteger(n) ? n.toFixed(1) : String(Math.round(n * 100) / 100);
}

/**
 * The player's points as a tappable number. Tapping opens a card with every scoring line:
 * category, points each, how many, and the points earned (Sideout's breakdown sheet).
 */
export function PointsButton({ value, name, team, dst, subtitle, lines, status, className = "" }: {
  value: number; name: string; team?: TeamLike | null; dst?: boolean; subtitle: string; lines: BreakdownLine[]; status?: string | null; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = () => {
    setClosing(true);
    timer.current = setTimeout(() => { setOpen(false); setClosing(false); }, 170);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} className={`tabular-nums underline decoration-gray-300 decoration-dotted underline-offset-4 ${className}`} aria-label={`${name}: ${fmt(value)} points, show breakdown`}>
        {value.toFixed(1)}
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[60] flex items-end justify-center text-left sm:items-center" role="dialog" aria-modal="true" aria-label={`${name} points breakdown`}>
          <button className={`absolute inset-0 bg-black/50 ${closing ? "animate-fade-out" : "animate-fade-in"}`} aria-label="Close" onClick={close} />
          <div className={`relative mx-3 w-full max-w-md ${closing ? "animate-pop-out" : "animate-pop"}`} style={{ transformOrigin: "50% 80%" }}>
            <div className="relative mb-[calc(env(safe-area-inset-bottom)+12px)] rounded-2xl bg-surface pt-12 shadow-2xl sm:mb-0">
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 rounded-full bg-surface p-1 shadow">
                <SubjectAvatar name={name} team={team} dst={dst} size={80} />
              </div>
              <button className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full text-2xl leading-none text-gray-500 hover:bg-gray-100" aria-label="Close" onClick={close}>×</button>
              <div className="px-5 text-center">
                <h2 className="text-xl font-extrabold">{name}</h2>
                <p className="text-sm text-gray-500">{subtitle}{status === "provisional" ? " · live, provisional" : status === "updated" ? " · updated after a stat correction" : ""}</p>
              </div>
              <table className="mt-3 w-full table-fixed text-sm">
                <thead>
                  <tr className="border-y border-gray-200 text-[11px] font-extrabold uppercase tracking-wide text-gray-800">
                    <th className="py-2.5 pl-5 text-left">Statistic</th>
                    <th className="w-16 py-2.5 text-right">Pts per</th>
                    <th className="w-12 py-2.5 text-right">#</th>
                    <th className="w-20 py-2.5 pr-5 text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.length === 0 ? (
                    <tr><td colSpan={4} className="py-4 text-center text-gray-500">No scoring plays yet.</td></tr>
                  ) : lines.map((r) => (
                    <tr key={r.key}>
                      <td className="py-3 pl-5">{r.label}</td>
                      <td className="py-3 text-right text-gray-600">{r.key === "pointsAllowed" ? "tier" : r.each}</td>
                      <td className="py-3 text-right text-gray-600">{r.count}</td>
                      <td className={`py-3 pr-5 text-right font-bold ${r.points < 0 ? "text-red-600" : ""}`}>{fmt(r.points)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td colSpan={3} className="rounded-bl-2xl py-3 pl-5 font-extrabold">TOTAL</td>
                    <td className={`rounded-br-2xl py-3 pr-5 text-right text-base font-extrabold ${value < 0 ? "text-red-600" : ""}`}>{fmt(value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
