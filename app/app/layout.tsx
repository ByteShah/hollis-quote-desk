import Link from "next/link";
import { getTenant } from "@/lib/tenant";
import { signOut } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { company, user } = await getTenant();
  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="font-semibold">{company.name}</div>
          <nav className="flex gap-4 text-sm text-stone-600">
            <Link href="/app/quotes" className="hover:text-stone-900">Quotes</Link>
            <Link href="/app/quotes/new" className="hover:text-stone-900">New quote</Link>
            <Link href="/app/rates" className="hover:text-stone-900">Rates</Link>
            <Link href="/app/customers" className="hover:text-stone-900">Customers</Link>
            <Link href="/app/settings" className="hover:text-stone-900">Settings</Link>
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-stone-500">
            <span>{user.email}</span>
            <form action={signOut}>
              <button className="underline hover:text-stone-900">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
