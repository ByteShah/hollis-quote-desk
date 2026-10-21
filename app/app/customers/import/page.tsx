import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { History } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { LinkButton, PageHeader } from "@/components/ui";
import { ImportWizard } from "@/app/app/imports/wizard";

export const metadata: Metadata = { title: "Import customers" };

export default async function ImportPage() {
  const { can } = await getTenant();
  if (!can("data.import")) redirect("/app/customers");
  return (
    <div className="animate-rise">
      <PageHeader
        eyebrow={<Link href="/app/customers" className="hover:text-ink">Customers</Link>}
        title="Import customers"
        description="New people are added; existing customers (matched by email or phone) gain any new details, but nothing they already have is overwritten. Duplicates inside the file are merged."
        actions={
          <LinkButton href="/app/imports" variant="ghost">
            <History className="size-4" /> Import history
          </LinkButton>
        }
      />
      <ImportWizard kind="customers" />
    </div>
  );
}
