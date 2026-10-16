"use client";

import { useState } from "react";
import { deletePoints, savePoints } from "@/app/actions";
import { tempId, useApp } from "@/components/AppState";
import { Button, Empty, Field, PageTitle, Section, usd } from "@/components/ui";
import { centsPerPoint } from "@/lib/domain/bestCard";
import { formatDate } from "@/lib/domain/dates";

export default function PointsPage() {
  const { catalog, data, today, mutate } = useApp();
  const [program, setProgram] = useState(catalog.programs[0]?.id ?? "");
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [cpp, setCpp] = useState("");

  const rows = data.points.map((p) => {
    const cents = centsPerPoint(p.program, catalog, data.settings, data.points);
    return { p, name: catalog.programs.find((x) => x.id === p.program)?.name ?? p.program, cents, value: (p.balance * cents) / 100 };
  });
  const total = rows.reduce((s, r) => s + r.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle sub="Manual balances. Estimated value uses your cents-per-point (default 1¢ — an assumption, not an issuer value).">
        Points balances
      </PageTitle>
      <Section title={`Estimated total: ${usd(total)}`}>
        {rows.length === 0 ? (
          <Empty>No balances yet.</Empty>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {rows.map(({ p, name, cents, value }) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 font-medium">{name}</span>
                <span>{p.balance.toLocaleString("en-US")}</span>
                <span className="text-muted">
                  @ {cents}¢ ≈ {usd(value)}
                </span>
                <span className="text-xs text-muted">as of {formatDate(p.asOf)}</span>
                <button
                  type="button"
                  className="text-xs text-muted underline hover:text-danger"
                  onClick={() => mutate((d) => ({ ...d, points: d.points.filter((x) => x.id !== p.id) }), () => deletePoints(p.id))}
                >
                  delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section title="Update a balance">
        <form
          className="grid grid-cols-2 gap-2 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            const entry = { program, balance: Number(balance), asOf, centsPerPoint: cpp === "" ? null : Number(cpp) };
            mutate(
              (d) => ({ ...d, points: [...d.points.filter((x) => x.program !== program), { id: tempId(), ...entry }] }),
              () => savePoints(entry),
            );
            setBalance("");
          }}
        >
          <Field label="Program">
            <select value={program} onChange={(e) => setProgram(e.target.value)}>
              {catalog.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Balance">
            <input type="number" step="any" value={balance} onChange={(e) => setBalance(e.target.value)} required />
          </Field>
          <Field label="As of">
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} required />
          </Field>
          <Field label="¢ per point">
            <input type="number" step="any" min={0} value={cpp} onChange={(e) => setCpp(e.target.value)} placeholder="optional" />
          </Field>
          <div className="flex items-end">
            <Button type="submit" variant="primary">
              Save
            </Button>
          </div>
        </form>
      </Section>
    </div>
  );
}
