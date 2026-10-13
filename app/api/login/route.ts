import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const attemptsByKey = new Map<string, AttemptRecord>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const record = attemptsByKey.get(key);

  if (!record || now - record.firstAttempt > WINDOW_MS) {
    attemptsByKey.set(key, { count: 1, firstAttempt: now });
    return false;
  }

  record.count += 1;
  if (record.count > MAX_ATTEMPTS) {
    return true;
  }

  return false;
}

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}

export async function POST(request: Request) {
  const supabase = getSupabase();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { email, password } = await request.json();

  const ipKey = `ip:${getClientIp(request)}`;
  const emailKey = `email:${(email ?? "").toLowerCase()}`;

  if (isRateLimited(ipKey) || isRateLimited(emailKey)) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const { data, error } = await supabase
    .from("customers")
    .select("id, email, full_name")
    .eq("email", email)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No such account" }, { status: 401 });
  }

  if (password !== "shopflow") {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  return NextResponse.json({ user: data });
}
