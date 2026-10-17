"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { shortDate } from "@/lib/domain/dates";

/**
 * Large title (34px/700, iOS-style) with an optional right-hand slot. Screens
 * carry no intro paragraphs: optional `help` hides behind an ⓘ next to the title.
 */
export function PageTitle({
  children,
  right,
  help,
  className = "",
}: {
  children: React.ReactNode;
  right?: React.ReactNode;
  help?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={`mb-1 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex min-w-0 items-center gap-1 text-[34px] leading-tight font-bold tracking-tight">
          <span className="min-w-0">{children}</span>
          {help && <InfoToggle open={open} onToggle={() => setOpen((o) => !o)} controls={id} label="About this screen" />}
        </h1>
        {right}
      </div>
      {help && (
        <p id={id} hidden={!open} className="mt-1 max-w-2xl text-sm text-muted">
          {help}
        </p>
      )}
    </div>
  );
}

/** Mono caps section label above a grouped list (11px, muted), with an optional right-hand link/action. */
export function GroupLabel({ children, right, id }: { children: React.ReactNode; right?: React.ReactNode; id?: string }) {
  return (
    <div className="mt-5 mb-1.5 flex min-h-6 items-end justify-between gap-2 px-1 first:mt-0">
      <h2 id={id} className="font-mono text-[11px] font-bold tracking-wider text-muted uppercase">
        {children}
      </h2>
      {right}
    </div>
  );
}

/** iOS-style inset grouped list: list surface, 14px radius, hairline separators between rows. */
export function Group({
  children,
  className = "",
  ...rest
}: { children: React.ReactNode; className?: string } & Omit<React.HTMLAttributes<HTMLUListElement>, "className">) {
  return (
    <ul {...rest} className={`divide-y divide-hairline overflow-hidden rounded-[14px] bg-list ${className}`}>
      {children}
    </ul>
  );
}

/** Padding for free-form content (forms, figures) inside a Group item. */
export const CELL = "px-4 py-3";

/**
 * One-line row: title over a muted sub line on the left; amount (mono, bold)
 * over a date (mono; urgent colour when due soon) on the right. A button when
 * `onClick` is set, a link when `href` is set.
 */
export function Row({
  title,
  sub,
  amount,
  date,
  urgent = false,
  bar,
  badges,
  chevron = false,
  onClick,
  href,
  ariaLabel,
  testId,
  id,
  className = "",
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  amount?: React.ReactNode;
  date?: React.ReactNode;
  urgent?: boolean;
  /** Card colour bar (10×28px) at the left. */
  bar?: string;
  /** Always-visible badges (⚠ Unverified, Community curated) after the title. */
  badges?: React.ReactNode;
  chevron?: boolean;
  onClick?: () => void;
  href?: string;
  ariaLabel?: string;
  testId?: string;
  id?: string;
  className?: string;
}) {
  const body = (
    <>
      {bar && <CardBar color={bar} />}
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate leading-snug font-semibold">{title}</span>
          {badges}
        </span>
        {sub && <span className="block truncate text-sm text-muted">{sub}</span>}
      </span>
      {(amount !== undefined || date !== undefined) && (
        <span className="shrink-0 text-right font-mono leading-tight">
          {amount !== undefined && <span className="block text-[15px] font-bold">{amount}</span>}
          {date !== undefined && (
            <span className={`block text-[11px] tracking-wider uppercase ${urgent ? "font-bold text-urgent" : "text-muted"}`}>{date}</span>
          )}
        </span>
      )}
      {chevron && (
        <span aria-hidden className="shrink-0 font-mono text-lg leading-none text-muted">
          ›
        </span>
      )}
    </>
  );
  const cls = `flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left ${className}`;
  return (
    <li id={id} data-testid={testId} className="scroll-mt-24">
      {href ? (
        <Link href={href} aria-label={ariaLabel} className={`${cls} hover:bg-text/[0.03]`}>
          {body}
        </Link>
      ) : onClick ? (
        <button type="button" aria-label={ariaLabel} onClick={onClick} className={`${cls} hover:bg-text/[0.03]`}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** The card-colour bar at the left of a row. */
export function CardBar({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-7 w-2.5 shrink-0 rounded-[3px]"
      style={{ background: color, boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.25)" }}
    />
  );
}

/** The small ⓘ toggle (32px target). */
export function InfoToggle({ open, onToggle, controls, label = "Source" }: { open: boolean; onToggle: () => void; controls: string; label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={open}
      aria-controls={controls}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:text-text ${open ? "text-text" : "text-muted"}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="10" r="8" />
        <path d="M10 9v5" strokeLinecap="round" />
        <circle cx="10" cy="6.2" r="0.6" fill="currentColor" />
      </svg>
    </button>
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

type Fact = { source_url: string; last_verified: string; verified: boolean; source_type?: "official" | "community"; note?: string };

/** The warnings that are never hidden: Community curated, or ⚠ Unverified. */
export function FactBadges({ fact }: { fact: Pick<Fact, "verified" | "source_type" | "note"> }) {
  if (fact.source_type === "community") {
    return (
      <Badge tone="info" title={fact.note}>
        Community curated
      </Badge>
    );
  }
  if (!fact.verified) {
    return (
      <Badge tone="warn" title={fact.note}>
        {/* U+FE0E keeps the warning sign as text, not an emoji. */}
        {"⚠︎ Unverified"}
      </Badge>
    );
  }
  return null;
}

/** Badges for a group of facts (e.g. on a drill-in row): Unverified if any is, Community if any is. */
export function GroupBadges({ facts }: { facts: Pick<Fact, "verified" | "source_type">[] }) {
  const unverified = facts.some((f) => f.source_type !== "community" && !f.verified);
  const community = facts.some((f) => f.source_type === "community");
  return (
    <>
      {unverified && <FactBadges fact={{ verified: false }} />}
      {community && <FactBadges fact={{ verified: true, source_type: "community" }} />}
    </>
  );
}

/**
 * Provenance behind ⓘ: badges stay visible; the ⓘ (32px, "Source") reveals the
 * source link, the checked date, an optional one-line description and the note.
 */
export function Provenance({
  fact,
  description,
  className = "",
  flow = false,
}: {
  fact: Fact;
  description?: React.ReactNode;
  className?: string;
  /** Lay the parts out in the parent's own (wrapping) flex row, so ⓘ stays inline and the details open on a new line. */
  flow?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const community = fact.source_type === "community";
  return (
    <span className={flow ? "contents text-xs text-muted" : `inline-flex flex-wrap items-center gap-x-1 text-xs text-muted ${className}`}>
      <FactBadges fact={fact} />
      <InfoToggle open={open} onToggle={() => setOpen((o) => !o)} controls={id} />
      <span id={id} hidden={!open} className="block basis-full pb-1 text-left text-xs text-muted" data-testid="provenance-detail">
        {description && <span className="mb-1 block text-sm text-text">{description}</span>}
        <span className="block">
          <a className="underline decoration-dotted underline-offset-2 hover:text-text" href={fact.source_url} target="_blank" rel="noreferrer">
            {community ? "Community source" : "Source"}
          </a>
          {" · checked "}
          <span className="font-mono">{shortDate(fact.last_verified)}</span>
        </span>
        {fact.note && <span className="mt-0.5 block">{fact.note}</span>}
      </span>
    </span>
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
}: React.ComponentProps<"button"> & { variant?: keyof typeof BUTTON; size?: "md" | "sm" }) {
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

