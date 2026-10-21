import { getTenant } from "@/lib/tenant";
import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { company, can } = await getTenant();
  const tabs = [
    { href: "/app/settings", label: "General" },
    { href: "/app/settings/ai", label: "AI provider" },
    ...(can("team.manage") ? [{ href: "/app/settings/team", label: "Team" }] : []),
    ...(can("data.import") ? [{ href: "/app/imports", label: "Import history" }] : []),
  ];
  return (
    <div className="animate-rise">
      <PageHeader title="Settings" description={`Settings for ${company.name}. Other companies using Quote Desk can't see any of this.`} />
      <SettingsTabs tabs={tabs} />
      {children}
    </div>
  );
}
