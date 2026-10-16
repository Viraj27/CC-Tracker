"use client";

import Link from "next/link";
import { shortDate } from "@/lib/domain/dates";

/** A hairline-separated section with a mono small-caps heading. No boxed containers. */
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
    <section id={id} className="scroll-mt-24 border-t border-hairline pt-4 pb-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-mono text-xs font-bold tracking-wider text-muted uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Same look as Section, collapsible; still part of the page (and of find-in-page once opened). */
export function Disclosure({
  title,
  meta,
  children,
  id,
  defaultOpen = false,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details id={id} open={defaultOpen} className="group scroll-mt-24 border-t border-hairline">
      <summary className="flex min-h-11 items-center justify-between gap-2 py-3">
        <h2 className="font-mono text-xs font-bold tracking-wider text-muted uppercase">{title}</h2>
        <span className="flex items-center gap-3 font-mono text-xs text-muted">
          {meta}
          <span aria-hidden className="disclosure-mark inline-block text-base leading-none transition-transform">
            +
          </span>
        </span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="mb-2">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
    </div>
  );
}

/** Small caps mono label, e.g. above a figure. */
export function Label({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[11px] tracking-wider text-muted uppercase ${className}`}>{children}</span>;
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
    ok: "text-ok border-ok/50",
    warn: "text-warn border-warn/50",
    danger: "text-urgent border-urgent/50",
    info: "text-muted border-hairline",
    accent: "text-text border-text/40",
  }[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${color}`}
    >
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
          {/* U+FE0E keeps the warning sign as text, not an emoji. */}
          {"⚠︎ Unverified"}
        </Badge>
      )}
      <span>
        <a className="underline decoration-dotted underline-offset-2 hover:text-text" href={fact.source_url} target="_blank" rel="noreferrer">
          {community ? "Community source" : "Source"}
        </a>
        {" · checked "}
        <span className="font-mono">{shortDate(fact.last_verified)}</span>
      </span>
      {fact.note && <span className="basis-full">{fact.note}</span>}
    </span>
  );
}

export function Progress({ value, color }: { value: number | null; color?: string }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className="h-1 w-full overflow-hidden rounded-full bg-hairline"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color ?? "var(--text)" }} />
    </div>
  );
}

const BUTTON = {
  primary: "bg-btn text-btn-text border-transparent hover:opacity-90",
  secondary: "bg-transparent text-text border-text/30 hover:border-text",
  ghost: "bg-transparent text-muted border-transparent hover:text-text",
  danger: "bg-transparent text-urgent border-urgent/50 hover:border-urgent",
};

export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON; size?: "md" | "sm" }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-full border font-semibold whitespace-nowrap transition disabled:opacity-40 ${
        size === "sm" ? "min-h-9 px-3.5 text-[13px]" : "min-h-11 px-5 text-sm"
      } ${BUTTON[variant]} ${className}`}
    />
  );
}

/** A Link styled as a pill button. */
export function PillLink({
  href,
  variant = "secondary",
  size = "md",
  children,
  className = "",
  ...rest
}: { href: string; variant?: keyof typeof BUTTON; size?: "md" | "sm"; children: React.ReactNode; className?: string } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  return (
    <Link
      href={href}
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-full border font-semibold whitespace-nowrap transition ${
        size === "sm" ? "min-h-9 px-3.5 text-[13px]" : "min-h-11 px-5 text-sm"
      } ${BUTTON[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-mono text-[11px] tracking-wider text-muted uppercase">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** A tiny physical card (same fill as the Wallet card) used in lists. */
export function CardSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-[15px] w-6 shrink-0 rounded-[3px]"
      style={{ background: color, boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.25), 0 1px 1px rgb(0 0 0 / 0.2)" }}
    />
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-medium underline decoration-hairline decoration-2 underline-offset-4 hover:decoration-text">
      {children}
    </Link>
  );
}

/** Hairline list: rows separated by 1px rules, no boxes. */
export const LIST = "divide-y divide-hairline";
