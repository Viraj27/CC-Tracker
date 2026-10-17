"use client";

import { useState } from "react";
import { deleteHolding, saveHolding } from "@/app/actions";
import type { Holding } from "@/lib/domain/types";
import { useApp } from "./AppState";
import { Button, Field } from "./ui";

const num = (s: string) => (s.trim() === "" ? null : Number(s));

/** Add or edit a holding: every holding field, catalog or custom (non-catalog) cards. */
export function HoldingForm({
  initial,
  onDone,
  onDeleted,
}: {
  initial?: Holding;
  onDone: (savedId?: string) => void;
  onDeleted?: () => void;
}) {
  const { catalog, data, mutate } = useApp();
  const [f, setF] = useState({
    catalogCardId: initial?.catalogCardId ?? "",
    nickname: initial?.nickname ?? "",
    issuer: initial?.issuer ?? "",
    accountType: initial?.accountType ?? "",
    approvalDate: initial?.approvalDate ?? "",
    status: initial?.status ?? "open",
    closedDate: initial?.closedDate ?? "",
    productChangedFromId: initial?.productChangedFromId ?? "",
    afMonth: initial?.afMonth?.toString() ?? "",
    afDay: initial?.afDay?.toString() ?? "",
    paymentDueDay: initial?.paymentDueDay?.toString() ?? "",
    notes: initial?.notes ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const before = new Set(data.holdings.map((h) => h.id));
        let savedId = initial?.id;
        const ok = await mutate(null, async () => {
          const next = await saveHolding({
            id: initial?.id,
            catalogCardId: f.catalogCardId || null,
            nickname: f.nickname || null,
            issuer: f.issuer || null,
            accountType: (f.accountType || null) as "personal" | "business" | null,
            approvalDate: f.approvalDate,
            status: f.status as Holding["status"],
            closedDate: f.closedDate || null,
            productChangedFromId: f.productChangedFromId || null,
            afMonth: num(f.afMonth),
            afDay: num(f.afDay),
            paymentDueDay: num(f.paymentDueDay),
            notes: f.notes || null,
          });
          savedId ??= next.holdings.find((h) => !before.has(h.id))?.id;
          return next;
        });
        if (ok) onDone(savedId);
      }}
    >
      <Field label="Card product (catalog)">
        <select value={f.catalogCardId} onChange={set("catalogCardId")}>
          <option value="">— Not in catalog —</option>
          {catalog.cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nickname" hint="Required for cards not in the catalog (e.g. an old store card that counts for 5/24).">
        <input value={f.nickname} onChange={set("nickname")} />
      </Field>
      {!f.catalogCardId && (
        <>
          <Field label="Issuer id" hint="e.g. chase, amex, capital_one">
            <input value={f.issuer} onChange={set("issuer")} />
          </Field>
          <Field label="Account type">
            <select value={f.accountType} onChange={set("accountType")}>
              <option value="">Personal (default)</option>
              <option value="personal">Personal</option>
              <option value="business">Business</option>
            </select>
          </Field>
        </>
      )}
      <Field label="Approval date">
        <input type="date" value={f.approvalDate} onChange={set("approvalDate")} required />
      </Field>
      <Field label="Status">
        <select value={f.status} onChange={set("status")}>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="product_changed">Product-changed (old product)</option>
        </select>
      </Field>
      {f.status === "closed" && (
        <Field label="Closed date">
          <input type="date" value={f.closedDate} onChange={set("closedDate")} />
        </Field>
      )}
      <Field label="Product-changed from" hint="Set on the new product so 5/24 counts the account once.">
        <select value={f.productChangedFromId} onChange={set("productChangedFromId")}>
          <option value="">—</option>
          {data.holdings
            .filter((h) => h.id !== initial?.id)
            .map((h) => (
              <option key={h.id} value={h.id}>
                {h.nickname || catalog.cards.find((c) => c.id === h.catalogCardId)?.name || h.id} ({h.approvalDate})
              </option>
            ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="AF month">
          <input type="number" min={1} max={12} value={f.afMonth} onChange={set("afMonth")} placeholder="1–12" />
        </Field>
        <Field label="AF day">
          <input type="number" min={1} max={31} value={f.afDay} onChange={set("afDay")} placeholder="1–31" />
        </Field>
      </div>
      <Field label="Payment due day">
        <input type="number" min={1} max={31} value={f.paymentDueDay} onChange={set("paymentDueDay")} placeholder="1–31" />
      </Field>
      <Field label="Notes">
        <textarea rows={2} value={f.notes} onChange={set("notes")} />
      </Field>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        <Button type="submit" variant="primary">
          Save
        </Button>
        <Button onClick={() => onDone()}>Cancel</Button>
        {initial && (
          <Button
            variant="danger"
            className="ml-auto"
            onClick={async () => {
              if (!confirm("Delete this card and all its logged data?")) return;
              const ok = await mutate(null, () => deleteHolding(initial.id));
              if (ok) (onDeleted ?? onDone)();
            }}
          >
            Delete card
          </Button>
        )}
      </div>
    </form>
  );
}
