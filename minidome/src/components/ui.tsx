import Link from "next/link";
import { LocalTime, Relative } from "@/components/local-time";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2 px-4 pt-4 sm:px-0">
      <div className="min-w-0">
        <h1 className="truncate text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

/** Card. On phones it runs edge to edge, like a native app list. */
export function Card({ title, action, children, className = "", flush = false }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; flush?: boolean }) {
  return (
    <section className={`mx-3 rounded-2xl bg-surface shadow-lg shadow-black/20 sm:mx-0 sm:shadow-sm ${className}`}>
      {title || action ? (
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
          {title ? <h2 className="flex items-center gap-2 text-[13px] font-extrabold uppercase tracking-wide text-gray-900"><span className="inline-block h-3.5 w-1 rounded-full bg-gold-400" aria-hidden />{title}</h2> : <span />}
          {action}
        </div>
      ) : null}
      <div className={flush ? "" : "p-4"}>{children}</div>
    </section>
  );
}

const tones = {
  slate: "bg-gray-100 text-gray-600",
  coral: "bg-brand-950/50 text-brand-300",
  mint: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  blue: "bg-sky-50 text-sky-700",
  dark: "bg-brand-800 text-white",
  gold: "bg-gold-400 text-charcoal",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

export function GameStatus({ status, kickoff, period, clock }: { status: string; kickoff: string; period?: string | null; clock?: string | null }) {
  if (status === "live") return <Badge tone="red">● {period ?? "Live"}{clock ? ` ${clock}` : ""}</Badge>;
  if (status === "halftime") return <Badge tone="red">● Halftime</Badge>;
  if (status === "final") return <Badge tone="dark">Final{period === "F/OT" ? "/OT" : ""}</Badge>;
  if (status === "postponed") return <Badge tone="amber">Postponed</Badge>;
  if (status === "suspended") return <Badge tone="amber">Suspended</Badge>;
  if (status === "cancelled") return <Badge tone="red">Cancelled</Badge>;
  return <Badge tone="blue"><LocalTime iso={kickoff} mode="kickoff" /></Badge>;
}

export function ScoreStatus({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  if (status === "provisional") return <Badge tone="amber">Live · provisional</Badge>;
  if (status === "updated") return <Badge tone="blue">Updated</Badge>;
  return <Badge tone="dark">Final</Badge>;
}

export function Points({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) return <span className={`text-gray-400 ${className}`}>–</span>;
  const tone = value < 0 ? "text-red-600" : "text-gray-900";
  return <span className={`font-bold tabular-nums ${tone} ${className}`}>{value.toFixed(1)}</span>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-gray-500">{children}</p>;
}

/** Shows how fresh the NFL data is. Never presents old data as current. */
export function Freshness({ label = "Stats updated", at }: { label?: string; at: string | null | undefined }) {
  return <span className="text-xs text-gray-500">{label} <Relative iso={at} /></span>;
}

export function Notice({ tone = "slate", children }: { tone?: "slate" | "amber" | "red" | "mint"; children: React.ReactNode }) {
  const c = { slate: "border-brand-900 bg-brand-950/50 text-gray-900", amber: "border-amber-200 bg-amber-50 text-amber-900", red: "border-red-200 bg-red-50 text-red-900", mint: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
  return <div className={`mx-4 rounded-lg border px-3 py-2.5 text-sm sm:mx-0 ${c}`}>{children}</div>;
}

const AVATAR_COLORS = ["bg-sky-100 text-sky-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-violet-100 text-violet-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];

/** Initials circle. Colour is stable per name. */
export function Avatar({ name, size = 40, ring }: { name: string; size?: number; ring?: string }) {
  const parts = name.trim().split(/\s+/).map((w) => Array.from(w));
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "")).toUpperCase();
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-extrabold ${AVATAR_COLORS[h % AVATAR_COLORS.length]}`} style={{ width: size, height: size, fontSize: size * 0.36, boxShadow: ring ? `0 0 0 2px ${ring}` : undefined }} aria-hidden>
      {initials || "?"}
    </span>
  );
}

export function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 pb-2 pt-1 sm:px-0">
      <h2 className="text-lg font-extrabold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="link text-xs">{children}</Link>;
}
