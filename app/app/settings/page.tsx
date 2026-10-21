import type { Metadata } from "next";
import { Building2, ListChecks } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { Card } from "@/components/ui";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Settings" };

export default async function GeneralSettingsPage() {
  const { company, can } = await getTenant();
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
      <Card title="Company and quoting rules" icon={Building2}>
        <CompanyForm
          readOnly={!can("company.settings")}
          initial={{
            name: company.name,
            min_charge: company.min_charge,
            vat_percent: Math.round(company.vat_rate * 10000) / 100,
            auto_quote_max_m2: company.auto_quote_max_m2,
            price_review_months: company.price_review_months,
            quoting_rules: company.quoting_rules,
          }}
        />
      </Card>
      <Card title="How these are used" icon={ListChecks}>
        <ul className="space-y-2.5 text-[13px] leading-relaxed text-ink-2">
          <li><strong className="font-medium text-ink">Minimum charge</strong> is added automatically as a top-up line when a job comes in under it.</li>
          <li><strong className="font-medium text-ink">VAT</strong> is shown separately on every quote; prices are always ex VAT.</li>
          <li><strong className="font-medium text-ink">Site-visit size</strong>: anything bigger is never priced from an email, whatever the AI says.</li>
          <li><strong className="font-medium text-ink">Price review</strong>: prices older than this are flagged on the price list and on quotes.</li>
          <li><strong className="font-medium text-ink">Quoting rules</strong> are given to the AI with every enquiry: work you don&apos;t do, when to ask for a visit, how you like jobs priced.</li>
        </ul>
      </Card>
    </div>
  );
}
