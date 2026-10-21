"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTenant } from "@/lib/tenant";

const noteInput = z.object({
  entity: z.enum(["rate", "customer", "quote"]),
  entityId: z.uuid(),
  note: z.string().trim().min(1, "Write a note first.").max(2000),
  path: z.string().startsWith("/app/"),
});

const TABLE = { rate: "rates", customer: "customers", quote: "quotes" } as const;

/** Adds a note to a record's history. The only kind of history entry a user writes directly. */
export async function addNote(input: unknown): Promise<{ error?: string }> {
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid note." };
  const { entity, entityId, note, path } = parsed.data;
  const { supabase, company, user } = await getTenant();

  // The record must belong to this company (RLS returns nothing otherwise).
  const { data: record } = await supabase.from(TABLE[entity]).select("id").eq("id", entityId).maybeSingle();
  if (!record) return { error: "Record not found." };

  const { error } = await supabase.from("audit_log").insert({
    company_id: company.id,
    user_id: user.id,
    user_email: user.email,
    action: "note",
    entity,
    entity_id: entityId,
    note,
  });
  if (error) return { error: "Couldn't save the note." };
  revalidatePath(path);
  return {};
}
