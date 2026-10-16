"use client";

import Link from "next/link";
import { formatDate } from "@/lib/domain/dates";

export function Section({
  title,
  action,
  children,
  id,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold sm:text-2xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
    </div>
  );
}

export const usd = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: 2 });

export function Badge({
  tone = "info",
  children,
  title,
}: {
  tone?: "ok" | "warn" | "danger" | "info" | "accent";
  children: React.ReactNode;
  title?: string;
}) {
  const color = {
    ok: "text-ok border-ok/40",
    warn: "text-warn border-warn/40",
    danger: "text-danger border-danger/40",
    info: "text-info border-border",
    accent: "text-accent border-accent/40",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}>
      {children}
    </span>
  );
}

/** Source link + last-verified date; community badge, or loud warning when unverified. */
export function Provenance({
  fact,
}: {
  fact: { source_url: string; last_verified: string; verified: boolean; source_type?: "official" | "community"; note?: string };
}) {
  const community = fact.source_type === "community";
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      {community && (
        <Badge tone="info" title={fact.note}>
          Community curated
        </Badge>
      )}
      {!community && !fact.verified && (
        <Badge tone="warn" title={fact.note}>
          ⚠ Unverified
        </Badge>
      )}
      <a className="underline decoration-dotted underline-offset-2 hover:text-text" href={fact.source_url} target="_blank" rel="noreferrer">
        {community ? "Community source" : "Source"}
      </a>
      <span>checked {formatDate(fact.last_verified)}</span>
      {fact.note && <span className="basis-full">{fact.note}</span>}
    </span>
  );
}

export function Progress({ value, color }: { value: number | null; color?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color ?? "var(--accent)" }} />
    </div>
  );
}

export function Button({
  variant = "secondary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-white dark:text-black border-transparent hover:opacity-90",
    secondary: "bg-surface-2 text-text border-border hover:border-accent",
    ghost: "bg-transparent text-muted border-transparent hover:text-text",
    danger: "bg-transparent text-danger border-danger/40 hover:bg-danger/10",
  }[variant];
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-9 items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 ${styles} ${className}`}
    />
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function CardSwatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block h-4 w-6 shrink-0 rounded-sm" style={{ background: color }} />;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-accent underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}
