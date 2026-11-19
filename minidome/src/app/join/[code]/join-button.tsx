"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { joinLeague } from "@/app/actions";

export function JoinButton({ code }: { code: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => {
        const r = await joinLeague(code);
        if (!r.ok) return setError(r.error);
        router.replace(`/leagues/${r.data!.id}?joined=1`);
      })}>{pending ? "Joining…" : "Join the league"}</button>
      {error ? <p className="text-sm text-red-600" role="alert">{error}</p> : null}
    </>
  );
}
