'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Row {
  proposal_id: string; customer_name: string; profile_id: string;
  proposed_loan_amount: string; proposed_duration_months: number | null;
  proposed_installment: string | null; offday: string | null;
  area: string | null; prospect_date: string | null; stage: string;
  old_mcl: string | null; mem_pf: number | null;
}

const bdt = (n: unknown) => n == null ? '—' : '৳' + Number(n).toLocaleString('en-IN');

export default function Proposals() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/proposals?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(`Could not load proposals: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <>
      <h2>Proposals</h2>
      <p className="note">
        Installments come from the rate schedule, matched on amount, duration and the
        member&apos;s off day. Nothing here is stored — it is recalculated on every read.
      </p>

      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="q">Search by member name, Proposal ID or Profile ID</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
      </div>

      {error && <div className="msg">{error}</div>}
      {busy && <p className="note">Loading…</p>}

      {!busy && rows.length === 0 && (
        <p className="note">
          No proposals yet. <Link href="/proposals/new">Create one</Link>.
        </p>
      )}

      {rows.length > 0 && (
        <div className="scroller">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Member</th><th className="num">Amount</th>
                <th className="num">Months</th><th className="num">Installment</th>
                <th>Off day</th><th>Area</th><th>Date</th><th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.proposal_id}>
                  <td>{p.proposal_id}</td>
                  <td>{p.customer_name}</td>
                  <td className="num">{bdt(p.proposed_loan_amount)}</td>
                  <td className="num">{p.proposed_duration_months ?? '—'}</td>
                  <td className="num">{bdt(p.proposed_installment)}</td>
                  <td>{p.offday ?? '—'}</td>
                  <td>{p.area ?? '—'}</td>
                  <td>{p.prospect_date ? String(p.prospect_date).slice(0, 10) : '—'}</td>
                  <td>{p.stage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
