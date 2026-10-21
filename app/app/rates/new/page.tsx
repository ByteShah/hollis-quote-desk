import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { Card, PageHeader } from "@/components/ui";
import { RateForm } from "../rate-form";

export const metadata: Metadata = { title: "New price list item" };

export default async function NewRatePage() {
  const { supabase, company, can } = await getTenant();
  if (!can("rate.edit")) redirect("/app/rates");
  const { data: cats } = await supabase.from("rates").select("category").eq("company_id", company.id).not("category", "is", null);
  const categories = [...new Set((cats ?? []).map((c) => c.category as string))].sort();

  return (
    <div className="max-w-3xl animate-rise">
      <PageHeader
        eyebrow={<Link href="/app/rates" className="hover:text-ink">Price list</Link>}
        title="New item"
        description="Items in use are offered to the AI straight away. The price is recorded as the first version in the item's price history."
      />
      <Card>
        <RateForm
          mode="create"
          initial={{ code: "", item: "", category: "", unit: "m2", status: "active", notes: "", modifiers: [], price: "" }}
          categories={categories}
          readOnly={false}
        />
      </Card>
    </div>
  );
}
