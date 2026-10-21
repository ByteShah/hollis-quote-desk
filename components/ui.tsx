import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Small design-system primitives. Server-safe (no hooks), so pages stay
// server components and only interactive pieces ship JavaScript.

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "approve" | "danger";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand text-white shadow-sm hover:bg-brand-hover",
  secondary: "border border-line-strong bg-surface text-ink shadow-(--shadow-card) hover:bg-sunken",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink",
  approve: "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800",
  danger: "border border-red-200 bg-surface text-red-700 hover:bg-red-50",
};
const SIZES: Record<Size, string> = { sm: "h-8 px-2.5 text-[13px] gap-1.5", md: "h-10 px-4 text-sm gap-2" };

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center rounded-lg font-medium transition",
    "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/20 disabled:pointer-events-none disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export type Tone = "neutral" | "brand" | "info" | "warning" | "danger" | "success";

const TONES: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2 ring-line",
  brand: "bg-brand-soft text-brand-ink ring-brand/15",
  info: "bg-sky-50 text-sky-800 ring-sky-200/70",
  warning: "bg-amber-50 text-amber-800 ring-amber-200/80",
  danger: "bg-red-50 text-red-700 ring-red-200/80",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200/80",
};
const DOTS: Record<Tone, string> = {
  neutral: "bg-muted",
  brand: "bg-brand",
  info: "bg-sky-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  success: "bg-emerald-500",
};

export function Badge({ tone = "neutral", dot, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", DOTS[tone])} />}
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-[13px] text-muted">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, icon: Icon, action, children, className, bodyClassName }: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card", className)}>
      {title && (
        <header className="flex items-center gap-2 border-b border-line/70 px-5 py-3.5">
          {Icon && <Icon className="size-4 text-muted" aria-hidden />}
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {action && <div className="ml-auto">{action}</div>}
        </header>
      )}
      {/* bodyClassName replaces the default padding rather than competing with it */}
      <div className={bodyClassName ?? "p-5"}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-xl bg-sunken ring-1 ring-line">
        <Icon className="size-5 text-muted" aria-hidden />
      </div>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children && <p className="mt-1 max-w-sm text-sm text-muted">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-sunken",
        "before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_1.4s_infinite] before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent",
        className,
      )}
    />
  );
}

export function Stat({ label, value, hint, tone = "neutral", href }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span className={cn("size-1.5 rounded-full", DOTS[tone])} />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight num">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </>
  );
  return href ? (
    <Link href={href} className="card block px-4 py-3.5 transition hover:border-line-strong hover:shadow-(--shadow-pop)">
      {body}
    </Link>
  ) : (
    <div className="card px-4 py-3.5">{body}</div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{children}</kbd>;
}
