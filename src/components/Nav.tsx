"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "./AppState";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/cards", label: "Cards" },
  { href: "/eligibility", label: "5/24" },
  { href: "/payments", label: "Payments" },
  { href: "/rotating", label: "Rotating" },
  { href: "/best-card", label: "Best card" },
  { href: "/points", label: "Points" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  const { error, clearError, pending } = useApp();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
        <Link href="/" className="shrink-0 font-bold">
          CC-Tracker
        </Link>
        <nav aria-label="Main" className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 py-1 text-sm">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-md px-2 py-1 ${active ? "bg-surface-2 font-semibold text-text" : "text-muted hover:text-text"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <span aria-live="polite" className="w-4 shrink-0 text-xs text-muted">
          {pending ? "…" : ""}
        </span>
      </div>
      {error && (
        <div role="alert" className="border-t border-danger/40 bg-danger/10 px-4 py-2 text-sm text-danger">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="underline">
              Dismiss
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
