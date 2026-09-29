"use client";

import { useCallback, useEffect, useState } from "react";

// Σελίδα admin του pilot (μόνο για τα email του NORAYA_ADMIN_EMAILS):
// έσοδα / κόστος AI / κέρδος ανά μέρα, χρήση σήμερα, κωδικοί πρόσκλησης, λάθη.

type Data = any;

const usd = (n: number) => `$${(Number(n) || 0).toFixed(2)}`;
const eur = (n: number) => `€${(Number(n) || 0).toFixed(2)}`;

export default function PilotAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ code: "", group_key: "", label: "", party_key: "", max_uses: "5" });
  const [passScope, setPassScope] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch("/api/admin/pilot", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setError(d?.error || "Δεν επιτρέπεται η πρόσβαση.");
        setData(null);
        return;
      }
      setData(d);
    } catch {
      setError("Σφάλμα σύνδεσης.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(body: any) {
    setMsg(null);
    const r = await fetch("/api/admin/pilot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    setMsg(d?.ok ? "Έγινε." : d?.error || "Κάτι πήγε στραβά.");
    if (d?.ok) load();
    return Boolean(d?.ok);
  }

  const rate = data?.usd_to_eur || 0.9;

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-sm text-zinc-200">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-light text-white">Noraya — Pilot admin</h1>
          <button onClick={load} className="rounded-md border border-zinc-700 px-3 py-1.5 hover:border-white">
            Ανανέωση
          </button>
        </div>

        {error ? <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">{error}</div> : null}
        {msg ? <div className="rounded-lg border border-zinc-700 p-3">{msg}</div> : null}

        {data ? (
          <>
            <section className="rounded-xl border border-zinc-800 p-5">
              <h2 className="mb-3 text-lg text-white">Ρυθμίσεις (από το Vercel)</h2>
              <div className="grid gap-2 md:grid-cols-3">
                <div>Όριο ανά κατηγορία / μέρα: <b>{data.config.daily_limit}</b></div>
                <div>Με ξεκλείδωμα (όριο ασφαλείας): <b>{data.config.pass_cap}</b></div>
                <div>Αυτόματες αναλύσεις / μέρα: <b>{data.config.auto_daily_limit}</b></div>
                <div>Ανώτατο κόστος πελάτη / μέρα: <b>{usd(data.config.scope_daily_usd_cap)}</b></div>
                <div>Ανώτατο με ξεκλείδωμα: <b>{usd(data.config.pass_daily_usd_cap)}</b></div>
                <div>Τιμή ξεκλειδώματος: <b>{eur(data.config.day_pass_eur)}</b></div>
                <div>Όριο crons ανάλυσης / μέρα: <b>{usd(data.config.cron_daily_usd)}</b></div>
                <div>Όριο ταξινόμησης ειδήσεων / μέρα: <b>{usd(data.config.classify_daily_usd)}</b></div>
                <div>Ώρες crons (UTC): <b>{data.config.cron_hours_utc}</b></div>
                <div>
                  Κωδικός πρόσκλησης: <b>{data.config.invite_required ? "ναι" : "όχι"}</b> · Όρια:{" "}
                  <b>{data.config.limits_enabled ? "ενεργά" : "ανενεργά"}</b>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 p-5">
              <h2 className="mb-1 text-lg text-white">Έσοδα / κόστος ανά μέρα (30 μέρες)</h2>
              <p className="mb-3 text-xs text-zinc-500">
                Το κόστος AI είναι σε $ (όπως χρεώνει η Anthropic). Κέρδος ≈ έσοδα − κόστος × {rate} (ισοτιμία από
                NORAYA_USD_TO_EUR). Δεν περιλαμβάνει την προμήθεια Stripe.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="text-zinc-500">
                    <tr>
                      <th className="py-1 pr-4">Μέρα</th>
                      <th className="pr-4">Πελάτες AI</th>
                      <th className="pr-4">Crons AI</th>
                      <th className="pr-4">Demo AI</th>
                      <th className="pr-4">Ξεκλειδώματα</th>
                      <th className="pr-4">Έσοδα</th>
                      <th>Κέρδος ≈</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.days.map((d: any) => {
                      const cost = d.user + d.cron + d.demo;
                      const profit = d.revenue - cost * rate;
                      return (
                        <tr key={d.day} className="border-t border-zinc-900">
                          <td className="py-1 pr-4">{d.day}</td>
                          <td className="pr-4">{usd(d.user)}</td>
                          <td className="pr-4">{usd(d.cron)}</td>
                          <td className="pr-4">{usd(d.demo)}</td>
                          <td className="pr-4">{d.passes}</td>
                          <td className="pr-4">{eur(d.revenue)}</td>
                          <td className={profit < 0 ? "text-amber-300" : "text-emerald-300"}>{eur(profit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 p-5">
                <h2 className="mb-3 text-lg text-white">Χρήση σήμερα ανά πελάτη</h2>
                {data.today_by_scope.length === 0 ? <p className="text-zinc-500">Καμία χρήση ακόμα.</p> : null}
                {data.today_by_scope.map((s: any) => (
                  <div key={s.scope} className="mb-3 border-b border-zinc-900 pb-2">
                    <div className="flex justify-between">
                      <b>{s.scope}</b>
                      <span>{usd(s.cost)}</span>
                    </div>
                    <div className="text-xs text-zinc-400">
                      {Object.entries(s.byCategory)
                        .map(([k, v]) => `${data.category_labels[k] || k}: ${v}`)
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border border-zinc-800 p-5">
                <h2 className="mb-3 text-lg text-white">Κόστος σήμερα ανά λειτουργία</h2>
                {data.today_by_route.map((r: any) => (
                  <div key={r.route} className="flex justify-between border-b border-zinc-900 py-1">
                    <span className="text-zinc-400">{r.route}</span>
                    <span>{usd(r.cost)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 p-5">
              <h2 className="mb-3 text-lg text-white">Κωδικοί πρόσκλησης</h2>
              <div className="mb-4 grid gap-2 md:grid-cols-6">
                <input
                  placeholder="Κωδικός (π.χ. ELAS-7K4Q-2026)"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="rounded bg-zinc-900 p-2 md:col-span-2"
                />
                <input
                  placeholder="Πελάτης (group, π.χ. elas)"
                  value={form.group_key}
                  onChange={(e) => setForm({ ...form, group_key: e.target.value })}
                  className="rounded bg-zinc-900 p-2"
                />
                <input
                  placeholder="party_key (π.χ. elas)"
                  value={form.party_key}
                  onChange={(e) => setForm({ ...form, party_key: e.target.value })}
                  className="rounded bg-zinc-900 p-2"
                />
                <input
                  placeholder="Μέγ. χρήστες"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  className="rounded bg-zinc-900 p-2"
                />
                <input
                  placeholder="Σημείωση"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  className="rounded bg-zinc-900 p-2"
                />
              </div>
              <button
                onClick={async () => {
                  if (await act({ action: "create_code", ...form, max_uses: Number(form.max_uses) || 5 }))
                    setForm({ code: "", group_key: "", label: "", party_key: "", max_uses: "5" });
                }}
                className="mb-4 rounded-md bg-white px-4 py-2 text-black hover:bg-zinc-200"
              >
                Νέος κωδικός
              </button>
              <table className="w-full text-left">
                <thead className="text-zinc-500">
                  <tr>
                    <th className="py-1">Κωδικός</th>
                    <th>Πελάτης</th>
                    <th>Κόμμα</th>
                    <th>Χρήσεις</th>
                    <th>Χρήστες</th>
                    <th>Κατάσταση</th>
                  </tr>
                </thead>
                <tbody>
                  {data.codes.map((c: any) => (
                    <tr key={c.code} className="border-t border-zinc-900">
                      <td className="py-1 font-mono">{c.code}</td>
                      <td>{c.group_key}</td>
                      <td>{c.party_key || "—"}</td>
                      <td>
                        {c.uses}/{c.max_uses}
                      </td>
                      <td>{c.users}</td>
                      <td>
                        <button
                          onClick={() => act({ action: "toggle_code", code: c.code, active: !c.active })}
                          className={c.active ? "text-emerald-300" : "text-zinc-500"}
                        >
                          {c.active ? "ενεργός (απενεργοποίηση)" : "ανενεργός (ενεργοποίηση)"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="rounded-xl border border-zinc-800 p-5">
              <h2 className="mb-3 text-lg text-white">Χειροκίνητο ξεκλείδωμα για σήμερα</h2>
              <p className="mb-3 text-xs text-zinc-500">
                Π.χ. όταν πληρώσουν με τιμολόγιο αντί για κάρτα. Λογαριασμός: group:&lt;πελάτης&gt; (π.χ. group:elas).
              </p>
              <div className="flex gap-2">
                <input
                  placeholder="group:elas"
                  value={passScope}
                  onChange={(e) => setPassScope(e.target.value)}
                  className="rounded bg-zinc-900 p-2"
                />
                <button
                  onClick={() => act({ action: "grant_pass", scope: passScope.trim(), amount_eur: 0 })}
                  className="rounded-md border border-zinc-700 px-4 py-2 hover:border-white"
                >
                  Ξεκλείδωμα σήμερα
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-zinc-800 p-5">
              <h2 className="mb-3 text-lg text-white">Τελευταία λάθη</h2>
              {data.errors.length === 0 ? <p className="text-zinc-500">Κανένα λάθος.</p> : null}
              {data.errors.map((e: any) => (
                <div key={e.id} className="border-t border-zinc-900 py-2">
                  <div className="text-xs text-zinc-500">
                    {new Date(e.created_at).toLocaleString("el-GR")} · {e.route}
                  </div>
                  <div className="whitespace-pre-wrap break-words">{e.message}</div>
                </div>
              ))}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
