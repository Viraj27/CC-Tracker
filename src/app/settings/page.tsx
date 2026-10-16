"use client";

import { useState } from "react";
import { exportData, importData, saveSettings } from "@/app/actions";
import { useApp } from "@/components/AppState";
import { Button, Field, PageTitle, Provenance, Section, usd } from "@/components/ui";

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

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Settings</PageTitle>
      <form
        className="flex flex-col gap-4"
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
        <Section title="Lead times (days)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <Field label="Annual fee">
              <input type="number" min={0} value={form.afLeadDays} onChange={(e) => setForm({ ...form, afLeadDays: e.target.value })} />
            </Field>
            <Field label="Expiring credits">
              <input type="number" min={0} value={form.creditLeadDays} onChange={(e) => setForm({ ...form, creditLeadDays: e.target.value })} />
            </Field>
            <Field label="Payments">
              <input type="number" min={0} value={form.paymentLeadDays} onChange={(e) => setForm({ ...form, paymentLeadDays: e.target.value })} />
            </Field>
            <Field label="Track payments from" hint="Earlier months are never flagged past due.">
              <input type="month" value={form.paymentTrackingStart} onChange={(e) => setForm({ ...form, paymentTrackingStart: e.target.value })} />
            </Field>
          </div>
        </Section>

        <Section title="Perk values (USD per use)">
          <ul className="flex flex-col gap-3">
            {catalog.perkDefaults.map((p) => (
              <li key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem]">
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted">
                    Default {usd(p.value_usd, 2)} — {p.basis}
                  </p>
                  <Provenance fact={p} />
                </div>
                <Field label="Your value">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder={p.value_usd === null ? "not set" : String(p.value_usd)}
                    value={form.perk[p.id] ?? ""}
                    onChange={(e) => setForm({ ...form, perk: { ...form.perk, [p.id]: e.target.value } })}
                  />
                </Field>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Cents per point (valuation assumption)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {catalog.programs.map((p) => (
              <Field key={p.id} label={p.name}>
                <input
                  type="number"
                  min={0}
                  step="any"
                  placeholder={String(p.default_cents_per_point)}
                  value={form.cpp[p.id] ?? ""}
                  onChange={(e) => setForm({ ...form, cpp: { ...form.cpp, [p.id]: e.target.value } })}
                />
              </Field>
            ))}
          </div>
        </Section>

        <div className="flex items-center gap-3">
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
    <Section title="Export / import" id="import">
      <p className="mb-3 text-sm text-muted">
        Export everything to JSON (backups, or moving to a hosted DB later). Import validates the file first. Your seed file
        (<code>seed/my-cards.json</code>, gitignored) is imported here.
      </p>
      <div className="flex flex-col gap-3">
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
        <fieldset className="flex flex-wrap items-center gap-4 text-sm">
          <legend className="mb-1 text-muted">Import mode</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "merge"} onChange={() => setMode("merge")} /> Merge (upsert; safe to re-run)
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} /> Replace all my data
          </label>
        </fieldset>
        <Field label="Import JSON file">
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
          <p role="status" className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>
            {message.text}
          </p>
        )}
      </div>
    </Section>
  );
}
