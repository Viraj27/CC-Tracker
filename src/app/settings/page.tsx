"use client";

import { useState } from "react";
import { exportData, importData, saveSettings } from "@/app/actions";
import { useApp } from "@/components/AppState";
import { Button, Field, Group, GroupLabel, PageTitle, Provenance, usd } from "@/components/ui";

export default function SettingsPage() {
  const { catalog, data, mutate } = useApp();
  const s = data.settings;
  const [form, setForm] = useState({
    afLeadDays: String(s.afLeadDays),
    creditLeadDays: String(s.creditLeadDays),
    paymentLeadDays: String(s.paymentLeadDays),
    paymentTrackingStart: s.paymentTrackingStart ?? "",
    perk: Object.fromEntries(Object.entries(s.perkValueOverrides).map(([k, v]) => [k, String(v)])) as Record<string, string>,
    cpp: Object.fromEntries(Object.entries(s.centsPerPoint).map(([k, v]) => [k, String(v)])) as Record<string, string>,
  });
  const [saved, setSaved] = useState(false);

  const numMap = (m: Record<string, string>) =>
    Object.fromEntries(Object.entries(m).filter(([, v]) => v.trim() !== "").map(([k, v]) => [k, Number(v)]));

  const lead = (k: "afLeadDays" | "creditLeadDays" | "paymentLeadDays", label: string) => (
    <li>
      <label className="flex min-h-12 items-center justify-between gap-3 px-4 py-1.5">
        <span>{label}</span>
        <input type="number" min={0} className="w-24 text-right font-mono" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
      </label>
    </li>
  );

  return (
    <div className="flex flex-col">
      <PageTitle>Settings</PageTitle>
      <form
        className="flex flex-col"
        onSubmit={async (e) => {
          e.preventDefault();
          const next = {
            afLeadDays: Number(form.afLeadDays),
            creditLeadDays: Number(form.creditLeadDays),
            paymentLeadDays: Number(form.paymentLeadDays),
            paymentTrackingStart: form.paymentTrackingStart || null,
            perkValueOverrides: numMap(form.perk),
            centsPerPoint: numMap(form.cpp),
          };
          const ok = await mutate((d) => ({ ...d, settings: next }), () => saveSettings(next));
          setSaved(ok);
        }}
      >
        <GroupLabel>Lead times (days)</GroupLabel>
        <Group>
          {lead("afLeadDays", "Annual fee")}
          {lead("creditLeadDays", "Expiring credits")}
          {lead("paymentLeadDays", "Payments")}
          <li>
            <label className="flex min-h-12 items-center justify-between gap-3 px-4 py-1.5">
              <span>
                Track payments from
                <span className="block text-xs text-muted">Earlier months never show past due</span>
              </span>
              <input type="month" className="w-40" value={form.paymentTrackingStart} onChange={(e) => setForm({ ...form, paymentTrackingStart: e.target.value })} />
            </label>
          </li>
        </Group>

        <GroupLabel>Perk values (USD per use)</GroupLabel>
        <Group>
          {catalog.perkDefaults.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-1">
                  <span className="font-medium">{p.name}</span>
                  <Provenance fact={p} description={`Default ${usd(p.value_usd, 2)}: ${p.basis}`} />
                </span>
                <span className="block font-mono text-[11px] tracking-wider text-muted uppercase">Default {usd(p.value_usd, 2)}</span>
              </span>
              <input
                type="number"
                min={0}
                step="any"
                aria-label={`Your value: ${p.name}`}
                className="w-24 shrink-0 text-right font-mono"
                placeholder={p.value_usd === null ? "not set" : String(p.value_usd)}
                value={form.perk[p.id] ?? ""}
                onChange={(e) => setForm({ ...form, perk: { ...form.perk, [p.id]: e.target.value } })}
              />
            </li>
          ))}
        </Group>

        <GroupLabel>Cents per point (assumption)</GroupLabel>
        <Group>
          {catalog.programs.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-12 items-center justify-between gap-3 px-4 py-1.5">
                <span className="min-w-0">{p.name}</span>
                <input
                  type="number"
                  min={0}
                  step="any"
                  className="w-24 shrink-0 text-right font-mono"
                  placeholder={String(p.default_cents_per_point)}
                  value={form.cpp[p.id] ?? ""}
                  onChange={(e) => setForm({ ...form, cpp: { ...form.cpp, [p.id]: e.target.value } })}
                />
              </label>
            </li>
          ))}
        </Group>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" variant="primary">
            Save settings
          </Button>
          {saved && <span className="text-sm text-ok">Saved</span>}
        </div>
      </form>

      <ExportImport />
    </div>
  );
}

function ExportImport() {
  const { replaceData } = useApp();
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section id="import" className="scroll-mt-24" aria-labelledby="import-heading">
      <GroupLabel id="import-heading">Export / import</GroupLabel>
      <div className="flex flex-col gap-3 rounded-[14px] bg-list p-4">
        <div>
          <Button
            onClick={async () => {
              const json = await exportData();
              const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `cc-tracker-export-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export JSON
          </Button>
        </div>
        <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <legend className="mb-1 font-mono text-[11px] tracking-wider text-muted uppercase">Import mode</legend>
          <label className="flex min-h-10 items-center gap-2">
            <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge (upsert; safe to re-run)
          </label>
          <label className="flex min-h-10 items-center gap-2">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace all my data
          </label>
        </fieldset>
        <Field label="Import JSON file" hint="Validated before anything is written. Your seed file is seed/my-cards.json (gitignored).">
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (mode === "replace" && !confirm("Replace ALL your cards and logged data with this file?")) return;
              setBusy(true);
              try {
                const res = await importData(await file.text(), mode);
                if (res.ok) {
                  replaceData(res.data);
                  setMessage({ ok: true, text: res.summary });
                } else {
                  setMessage({ ok: false, text: res.error });
                }
              } finally {
                setBusy(false);
              }
            }}
          />
        </Field>
        {message && (
          <p role="status" className={`text-sm ${message.ok ? "text-ok" : "text-urgent"}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
