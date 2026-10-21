import { notFound } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { getUser, isPlatformAdmin } from "@/lib/tenant";
import { signOut } from "@/app/login/actions";
import { Logo } from "@/components/status";

export const dynamic = "force-dynamic";

// Platform admin area. Not linked from the app; a 404 for everyone else.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getUser();
  if (!(await isPlatformAdmin())) notFound();
  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <Logo className="size-7" />
          <span className="font-semibold">Quote Desk</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">
            <ShieldCheck className="size-3" /> Platform admin
          </span>
          <span className="ml-auto hidden text-sm text-muted sm:inline">{user.email}</span>
          <form action={signOut}>
            <button className="rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink" aria-label="Sign out">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
