import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { LinkButton, PageHeader } from "@/components/ui";
import { ImportWizard } from "@/app/app/imports/wizard";

export const metadata: Metadata = { title: "Import price list" };

export default async function ImportPage() {
  const { can } = await getTenant();
  if (!can("data.import")) redirect("/app/rates");
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={<Link href="/app/rates" className="hover:text-ink">Price list</Link>}
        title="Import price list"
        description={`Add new items and update existing ones by code. Price changes become new dated versions; nothing is deleted. The same cleaning rules used on the original list (units, £ signs, "inc VAT", TBC) apply to every file.`}
        actions={
          <LinkButton href="/app/imports" variant="ghost">
            <History className="size-4" /> Import history
          </LinkButton>
        }
      />
      <ImportWizard kind="rates" />
    </div>
  );
}
