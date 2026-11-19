"use client";
import { useEffect, useState } from "react";
import { countdownParts, timeAgo } from "@/lib/time";

type Mode = "kickoff" | "datetime" | "date" | "time";
const FORMATS: Record<Mode, Intl.DateTimeFormatOptions> = {
  kickoff: { weekday: "short", hour: "numeric", minute: "2-digit" },
  datetime: { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  date: { weekday: "short", month: "short", day: "numeric" },
  time: { hour: "numeric", minute: "2-digit" },
};

/**
 * A moment stored in UTC, shown in the viewer's own time zone. The server doesn't know the
 * viewer's zone, so the time is filled in once the page reaches the browser.
 */
export function LocalTime({ iso, mode = "datetime" }: { iso: string; mode?: Mode }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => setText(new Intl.DateTimeFormat(undefined, FORMATS[mode]).format(new Date(iso))), [iso, mode]);
  return <time dateTime={iso} className="tabular-nums">{text ?? " "}</time>;
}

export function Relative({ iso }: { iso: string | null | undefined }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return <span>{now === null ? "" : timeAgo(iso, now)}</span>;
}

/** Live countdown to a kickoff ("2d 04h 12m" -> "12:05" in the last hour). */
export function Countdown({ to, done = "Kicked off" }: { to: string; done?: string }) {
  const [ms, setMs] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setMs(new Date(to).getTime() - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [to]);
  if (ms === null) return <span className="tabular-nums">&nbsp;</span>;
  if (ms <= 0) return <span>{done}</span>;
  const { d, h, m, s } = countdownParts(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="tabular-nums" aria-label={`${d} days ${h} hours ${m} minutes`}>
      {d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${pad(m)}:${pad(s)}`}
    </span>
  );
}
