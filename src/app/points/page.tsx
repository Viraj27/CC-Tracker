"use client";

import { useState } from "react";
import { deletePoints, savePoints } from "@/app/actions";
import { isTemp, tempId, useApp } from "@/components/AppState";
import { Button, CELL, Empty, Field, Group, GroupLabel, PageTitle, usd } from "@/components/ui";
import { centsPerPoint } from "@/lib/domain/bestCard";
import { shortDate } from "@/lib/domain/dates";

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
    <div className="flex flex-col">
      <PageTitle help="Manual balances. Estimated value uses your cents per point (default 1¢: an assumption, not an issuer value).">Points</PageTitle>
      <p className="px-1 pt-1">
        <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">Estimated total</span>
        <span className="font-mono text-5xl font-bold" data-testid="points-total">
          {usd(total)}
        </span>
      </p>
      <GroupLabel>Balances · {rows.length}</GroupLabel>
      <Group>
        {rows.length === 0 ? (
          <li className={CELL}>
            <Empty>No balances yet.</Empty>
          </li>
        ) : (
          rows.map(({ p, name, cents, value }) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{name}</span>
                <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">
                  @ {cents}¢ · as of {shortDate(p.asOf, today)}
                </span>
              </span>
              <span className="shrink-0 text-right font-mono leading-tight">
                <span className="block text-[15px] font-bold">{p.balance.toLocaleString("en-US")}</span>
                <span className="block text-[11px] text-muted">≈ {usd(value)}</span>
              </span>
              <button
                type="button"
                disabled={isTemp(p.id)}
                className="min-h-9 text-xs text-muted underline hover:text-urgent"
                onClick={() => mutate((d) => ({ ...d, points: d.points.filter((x) => x.id !== p.id) }), () => deletePoints(p.id))}
              >
                delete
              </button>
            </li>
          ))
        )}
      </Group>
      <GroupLabel>Update a balance</GroupLabel>
      <form
        className="grid grid-cols-2 gap-3 rounded-[14px] bg-list p-4 sm:grid-cols-5"
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
    </div>
  );
}
