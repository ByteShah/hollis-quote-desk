import { LogOut, ShieldCheck } from "lucide-react";
import { getTenant } from "@/lib/tenant";
import { signOut } from "@/app/login/actions";
import { MobileNav, SideNav } from "@/components/nav";
import { Logo, initials } from "@/components/status";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { company, user, role } = await getTenant();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen flex-col border-r border-line bg-sunken/50 px-3 py-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <Logo />
          <div className="leading-tight">
            <div className="text-sm font-semibold">Quote Desk</div>
            <div className="text-[11px] text-muted">Drafts you approve</div>
          </div>
        </div>

        <div className="mb-4 flex items-center gap-2.5 rounded-lg bg-surface px-2.5 py-2 ring-1 ring-line">
          <div className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft text-xs font-semibold text-brand-ink">
            {initials(company.name)}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-medium">{company.name}</div>
            <div className="text-[11px] capitalize text-muted">{role}</div>
          </div>
        </div>

        <SideNav />

        <div className="mt-auto space-y-3">
          <div className="flex items-start gap-2 rounded-lg px-2.5 text-[11px] leading-snug text-muted">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand" aria-hidden />
            Your data and AI key are only visible to {company.name}.
          </div>
          <div className="flex items-center gap-2 border-t border-line px-2.5 pt-3">
            <div className="min-w-0 flex-1 truncate text-xs text-ink-2">{user.email}</div>
            <form action={signOut}>
              <button className="rounded-md p-1.5 text-muted transition hover:bg-surface hover:text-ink" title="Sign out" aria-label="Sign out">
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-20 border-b border-line bg-canvas/90 px-4 pt-3 backdrop-blur lg:hidden">
        <div className="mb-3 flex items-center gap-2.5">
          <Logo className="size-6" />
          <span className="truncate text-sm font-semibold">{company.name}</span>
          <form action={signOut} className="ml-auto">
            <button className="rounded-md p-1.5 text-muted hover:text-ink" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
        <MobileNav />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-10 lg:py-9">{children}</main>
    </div>
  );
}
