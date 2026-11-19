import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";

/** Handles email verification, magic links, password resets and Google/Apple sign-in. */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const nextParam = url.searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const sb = await supabaseServer();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  if (!code && !tokenHash) return NextResponse.redirect(new URL(`/auth/finish?next=${encodeURIComponent(next)}`, url.origin));
  let ok = false;
  if (code) ok = !(await sb.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await sb.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  if (!ok) return NextResponse.redirect(new URL("/login?error=link", url.origin));
  return NextResponse.redirect(new URL(type === "recovery" ? "/auth/update-password" : next, url.origin));
}
