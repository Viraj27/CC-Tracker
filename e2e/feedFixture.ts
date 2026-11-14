/**
 * A made-up daily-refresh feed for the e2e run (the committed feed is empty until the routine
 * first runs). Dates are relative to `today` so nothing ages out. Every item is invented.
 */
import type { Feed } from "../src/lib/catalog/schema";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function fixtureFeed(today: string): Feed {
  const day = (n: number) => addDays(today, n);
  const post = (slug: string) => `https://example.com/posts/${slug}`;
  const deal = { source: "example-feed", expires: null, card_id: null, issuer: null };
  return {
    sources: [{ id: "example-feed", name: "Example Feed", url: "https://example.com/feed/", kind: "rss", trust: "community" }],
    deals: [
      // For your cards: an issuer the demo holds a card with, and a held card by id.
      { ...deal, id: "chase-offers-grocery", kind: "card_linked", title: "Chase Offers: 10% back at Example Grocer (demo)", url: post("chase-offers-grocery"), published: day(-2), added: day(-1), expires: day(10), issuer: "chase" },
      { ...deal, id: "reserve-transfer-bonus", kind: "shopping", title: "Demo: 30% transfer bonus for Sapphire Reserve", url: post("reserve-transfer-bonus"), published: day(-1), added: day(-1), card_id: "chase-sapphire-reserve" },
      // New card offers: a catalog card the demo does not hold.
      { ...deal, id: "amex-gold-100k", kind: "card_offer", title: "Demo: Amex Gold 100K for $6,000 in 6 months", url: post("amex-gold-100k"), published: day(-4), added: day(-4), expires: day(20), card_id: "amex-gold", issuer: "amex", offer: { bonus: 100000, unit: "points", min_spend: 6000, days: 180 } },
      // Shopping: a card-linked offer for an issuer the demo has no card with, and a plain deal.
      { ...deal, id: "amex-offers-laptops", kind: "card_linked", title: "Amex Offers: $100 back on $500 at Example Laptops (demo)", url: post("amex-offers-laptops"), published: day(-3), added: day(-3), issuer: "amex" },
      { ...deal, id: "portal-10x", kind: "shopping", title: "Demo: 10x at Example Outfitters through shopping portals", url: post("portal-10x"), published: day(-5), added: day(-5) },
      // What changed: reported, not confirmed on the issuer's page.
      { ...deal, id: "venture-x-lounge-reported", kind: "reported_change", title: "Demo: Venture X lounge guest access reported to end", url: post("venture-x-lounge"), published: day(-6), added: day(-6), card_id: "capital-one-venture-x" },
      // Past its end date: never shown.
      { ...deal, id: "expired-deal", kind: "shopping", title: "Demo: an expired deal", url: post("expired"), published: day(-20), added: day(-20), expires: day(-1) },
    ],
    changelog: [
      { date: day(-3), card_id: "chase-sapphire-reserve", path: "benefits.demo-dining-credit.amount", label: "Dining credit", from: "$5/mo", to: "$10/mo", effective: day(20), source_url: "https://example.com/reserve-terms", confirmed_by: "official_page" },
      { date: day(-10), card_id: "amex-gold", path: "public_offer.bonus", label: "Public offer", from: 60000, to: 100000, effective: null, source_url: post("amex-gold-100k"), confirmed_by: "community_post" },
      // Older than 60 days: not listed.
      { date: day(-90), card_id: "wells-fargo-autograph", path: "benefits.demo-old.amount", label: "Old change", from: 1, to: 2, effective: null, source_url: "https://example.com/autograph-terms", confirmed_by: "official_page" },
    ],
    meta: { ran_at: `${today}T06:00:00Z`, items_seen: 42, status: "ok", confirmations: { attempted: 2, failed: 1 } },
  };
}
