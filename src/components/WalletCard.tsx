import type { HoldingView } from "./derived";

const URGENT_CHIPS = /^(PAST DUE|DUE TODAY|FEE TODAY|CREDIT TODAY)$|^(DUE IN|FEE IN|CREDIT) [0-7]D$/;

export function issuerLabel(v: Pick<HoldingView, "holding" | "card">): string {
  return (v.card?.issuer ?? v.holding.issuer ?? "custom").replaceAll("_", " ");
}

/**
 * A physical-looking card face (ISO ID-1, 1.586:1): solid catalog colour, no
 * issuer logos or artwork. Name + state chip on top; issuer + annual fee below.
 */
export function WalletCard({ view, chip }: { view: HoldingView; chip: string | null }) {
  const { card, holding } = view;
  const product = card && holding.nickname && holding.nickname !== card.name ? card.name : null;
  const inactive = holding.status !== "open";
  const urgent = chip !== null && URGENT_CHIPS.test(chip);
  return (
    <div
      className={`relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-left sm:p-5 ${inactive ? "saturate-[0.35]" : ""}`}
      style={{
        background: view.color,
        color: view.ink,
        boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.22), inset 0 0 0 1px rgb(255 255 255 / 0.06), var(--card-shadow)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[17px] leading-snug font-bold">{view.name}</p>
          {product && <p className="truncate font-mono text-[10px] tracking-wider uppercase">{product}</p>}
        </div>
        {chip && (
          <span
            className="mt-0.5 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider whitespace-nowrap"
            style={urgent ? { background: view.ink, color: view.color, borderColor: view.ink } : { borderColor: "currentColor" }}
          >
            {chip}
          </span>
        )}
      </div>
      {/* A generic contact-chip outline: physical, not branded. */}
      <span aria-hidden className="block h-[22%] w-[13%] rounded-md border opacity-30" style={{ borderColor: "currentColor" }} />
      <div className="flex items-end justify-between gap-3">
        <span className="truncate font-mono text-[11px] tracking-wider uppercase">{issuerLabel(view)}</span>
        <span className="shrink-0 text-right font-mono leading-none">
          <span className="block text-[9px] tracking-wider">AF</span>
          <span className="text-2xl font-bold">{card ? (card.annual_fee.amount === null ? "?" : `$${card.annual_fee.amount}`) : "—"}</span>
        </span>
      </div>
    </div>
  );
}
