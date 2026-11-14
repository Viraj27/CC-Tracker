"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { dayDate } from "@/lib/domain/dates";
import { useApp } from "./AppState";
import { use524, useUnseenDeals } from "./derived";
import { PillLink } from "./ui";

/** Desktop header links. `short` is what shows when the full label would not fit the row; the link keeps its full name. */
const LINKS: { href: string; label: string; short?: string }[] = [
  { href: "/", label: "Wallet" },
  { href: "/up-next", label: "Up next" },
  { href: "/eligibility", label: "5/24" },
  { href: "/payments", label: "Payments" },
  { href: "/best-card", label: "Best card" },
  { href: "/apply", label: "Should I apply?", short: "Apply?" },
  { href: "/find-card", label: "Find a card", short: "Find card" },
  { href: "/deals", label: "Deals" },
];

/** Desktop: the screens opened least, behind "More" so the row fits at 1280px. */
const OVERFLOW_LINKS = [
  { href: "/rotating", label: "Rotating 5%" },
  { href: "/points", label: "Points" },
  { href: "/settings", label: "Settings" },
];

/** Screens reached through the phone's "More" tab. */
export const MORE_LINKS = [
  { href: "/payments", label: "Payments" },
  { href: "/rotating", label: "Rotating 5%" },
  { href: "/best-card", label: "Best card" },
  { href: "/apply", label: "Should I apply?" },
  { href: "/find-card", label: "Find a card" },
  { href: "/deals", label: "Deals" },
  { href: "/points", label: "Points" },
  { href: "/settings", label: "Settings" },
  { href: "/cards", label: "Add card" },
];

/** Desktop header: a small menu for OVERFLOW_LINKS. Closes on navigation, Escape and a click elsewhere. */
function DesktopMore({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  const active = OVERFLOW_LINKS.some((l) => path.startsWith(l.href));
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        data-testid="nav-more"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full px-2.5 py-1.5 ${active ? "bg-text/[0.07] font-semibold text-text" : "text-muted hover:text-text"}`}
      >
        More
      </button>
      {open && (
        <ul data-testid="nav-more-menu" className="absolute top-full right-0 z-30 mt-2 min-w-40 rounded-xl border border-hairline bg-bg p-1 shadow-lg">
          {OVERFLOW_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} className={`block rounded-lg px-3 py-2 hover:bg-text/[0.05] ${path.startsWith(l.href) ? "font-semibold text-text" : "text-muted hover:text-text"}`}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Whether this tab has navigated inside the app, so "‹ Wallet" can go back instead of pushing "/".
let lastPath: string | null = null;
let moved = false;
export const canGoBack = () => moved;

type Section = "wallet" | "up-next" | "eligibility" | "more" | null;

function sectionOf(path: string): Section {
  if (path === "/" || /^\/cards\/[^/]+/.test(path)) return "wallet";
  if (path.startsWith("/up-next")) return "up-next";
  if (path.startsWith("/eligibility")) return "eligibility";
  if (path === "/more" || MORE_LINKS.some((l) => path.startsWith(l.href))) return "more";
  return null;
}

/** `3 CARDS · 2/24 · NEXT OFF THU 15 JAN 2027` */
export function WalletStatus() {
  const { data, today } = useApp();
  const { status } = use524();
  const open = data.holdings.filter((h) => h.status === "open").length;
  return (
    <p className="truncate font-mono text-[11px] tracking-wider text-muted uppercase" data-testid="wallet-status">
      {open} {open === 1 ? "card" : "cards"} · <span data-testid="five24-count">{status.count}/24</span>
      {status.nextDropOff && (
        <span title={`Next 5/24 drop-off: ${status.nextDropOff.name}`}> · next off {dayDate(status.nextDropOff.dropOffDate, today)}</span>
      )}
    </p>
  );
}

/** New "For your cards" deals since the Deals page was last opened. */
const Dot = () => (
  <span data-testid="deals-dot" role="img" aria-label="new for your cards" className="ml-1 inline-block h-2 w-2 rounded-full bg-urgent align-middle" />
);

export function Nav() {
  const unseen = useUnseenDeals();
  const path = usePathname();
  const { error, clearError, pending } = useApp();
  useEffect(() => {
    if (lastPath !== null && lastPath !== path) moved = true;
    lastPath = path;
  }, [path]);
  return (
    <>
    {/* Phones get large titles instead of a web header (docs/SPEC-v5-app-pass.md §3.1). */}
    <header className="sticky top-0 z-20 hidden border-b border-hairline bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur lg:block">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <div className="min-w-0 flex-1 lg:flex-none">
          <Link href="/" className="text-[17px] font-bold tracking-tight">
            CC-Tracker
          </Link>
          <WalletStatus />
        </div>
        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-0.5 text-sm lg:flex">
          {LINKS.map((l) => {
            const active = l.href === "/" ? sectionOf(path) === "wallet" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                aria-label={l.short ? l.label : undefined}
                className={`shrink-0 rounded-full px-2.5 py-1.5 ${active ? "bg-text/[0.07] font-semibold text-text" : "text-muted hover:text-text"}`}
              >
                {l.short ?? l.label}
                {l.href === "/deals" && unseen > 0 && <Dot />}
              </Link>
            );
          })}
          <DesktopMore path={path} />
        </nav>
        <span aria-live="polite" className="w-4 shrink-0 font-mono text-xs text-muted">
          {pending ? "…" : ""}
        </span>
        <span className="hidden lg:block">
          <PillLink href="/cards" variant="primary" size="sm">
            Add card
          </PillLink>
        </span>
      </div>
    </header>
    {error && (
      <div role="alert" className="sticky top-0 z-30 border-b border-urgent/40 bg-bg px-4 pt-[calc(env(safe-area-inset-top)+8px)] pb-2 text-sm text-urgent lg:top-[61px] lg:pt-2">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <span>{error}</span>
          <button type="button" onClick={clearError} className="min-h-9 underline">
            Dismiss
          </button>
        </div>
      </div>
    )}
    {pending && (
      <span aria-hidden className="fixed top-[calc(env(safe-area-inset-top)+6px)] right-4 z-30 font-mono text-xs text-muted lg:hidden">
        …
      </span>
    )}
    </>
  );
}

const TABS: { href: string; label: string; section: Section; icon: React.ReactNode }[] = [
  {
    href: "/",
    label: "Wallet",
    section: "wallet",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
        <rect x="3" y="9" width="18" height="11" rx="2.5" />
        <path d="M5 9V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5V9" />
      </svg>
    ),
  },
  {
    href: "/up-next",
    label: "Up next",
    section: "up-next",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7.5V12l3 2" />
      </svg>
    ),
  },
  {
    href: "/eligibility",
    label: "5/24",
    section: "eligibility",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 19h16M7 19v-5M12 19V8M17 19v-9" />
      </svg>
    ),
  },
  {
    href: "/more",
    label: "More",
    section: "more",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="currentColor">
        <circle cx="5.5" cy="12" r="1.6" />
        <circle cx="12" cy="12" r="1.6" />
        <circle cx="18.5" cy="12" r="1.6" />
      </svg>
    ),
  },
];

/** Phone bottom tab bar (< 1024px), clear of the home indicator. */
export function TabBar() {
  const unseen = useUnseenDeals();
  const section = sectionOf(usePathname());
  return (
    <nav
      aria-label="Tabs"
      data-testid="tab-bar"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-4 px-[env(safe-area-inset-left)]">
        {TABS.map((t) => {
          const active = section === t.section;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${
                  active ? "text-text" : "text-muted"
                }`}
              >
                <span className="relative">
                  {t.icon}
                  {t.section === "more" && unseen > 0 && (
                    <span data-testid="deals-dot" role="img" aria-label="New deals for your cards" className="absolute -top-0.5 -right-1.5 h-2 w-2 rounded-full bg-urgent" />
                  )}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
