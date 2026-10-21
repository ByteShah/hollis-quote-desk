"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentials = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return "Enter your email and password.";
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown email and wrong password.
  if (error) return "Email or password is incorrect.";
  // Only same-site paths we expect, never an open redirect.
  const next = String(form.get("next") ?? "");
  redirect(/^\/(app|invite)\/[\w/?=&.-]*$/.test(next) && !next.includes("//") ? next : "/app/quotes");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
