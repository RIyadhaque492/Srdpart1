'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Row {
  proposal_id: string; customer_name: string; profile_id: string;
  proposed_loan_amount: string; proposed_duration_months: number | null;
  proposed_installment: string | null; offday: string | null;
  area: string | null; prospect_date: string | null; stage: string;
  old_mcl: string | null;
}

const bdt = (n: unknown) => (n == null ? '—' : '৳' + Number(n).toLocaleString('en-IN'));

export default function Proposals() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/proposals?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(`Could not load proposals: ${(e as Error).message}`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
  }, [q, load]);

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setDone(null); setError(null);
  }

  const waiting = rows.filter((r) => r.stage === 'Prospect');
  const allWaitingPicked = waiting.length > 0 && waiting.every((r) => picked.has(r.proposal_id));

  async function send() {
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await fetch('/api/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal_ids: Array.from(picked) }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Could not send.');
      else {
        setDone(`${data.sent} sent to feasibility review.`);
        setPicked(new Set());
        load(q);
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Proposals</h2>
      <p className="note">
        A new proposal waits here until you send it on. Tick the ones that are ready
        and they move to feasibility review. Installments come from the rate schedule
        and are recalculated on every read, never stored.
      </p>

      {done && <div className="msg ok">{done}</div>}
      {error && <div className="msg">{error}</div>}

      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="q">Search by member name, Proposal ID or Profile ID</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
      </div>

      {picked.size > 0 && (
        <div className="picked" style={{ marginBottom: 16 }}>
          <div>
            <strong>{picked.size} selected</strong>
            <div className="hint">{Array.from(picked).join(', ')}</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={send} disabled={busy}>
              {busy ? 'Sending…' : 'Send to feasibility'}
            </button>
            <button className="quiet" onClick={() => setPicked(new Set())} disabled={busy}>
              Clear
            </button>
          </div>
        </div>
      )}

      {loading && <p className="note">Loading…</p>}
      {!loading && rows.length === 0 && (
        <p className="note">
          No proposals found. <Link href="/proposals/new">Create one</Link>.
        </p>
      )}

      {rows.length > 0 && (
        <div className="scroller">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={allWaitingPicked}
                         aria-label="Select all waiting"
                         onChange={(e) => setPicked(e.target.checked
                           ? new Set(waiting.map((r) => r.proposal_id))
                           : new Set())} />
                </th>
                <th>ID</th><th>Member</th><th className="num">Amount</th>
                <th className="num">Months</th><th className="num">Installment</th>
                <th>Old MCL</th><th>Date</th><th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const selectable = p.stage === 'Prospect';
                return (
                  <tr key={p.proposal_id}>
                    <td>
                      {selectable
                        ? <input type="checkbox" checked={picked.has(p.proposal_id)}
                                 aria-label={`Select ${p.proposal_id}`}
                                 onChange={() => toggle(p.proposal_id)} />
                        : <span className="hint">·</span>}
                    </td>
                    <td>{p.proposal_id}</td>
                    <td>{p.customer_name}</td>
                    <td className="num">{bdt(p.proposed_loan_amount)}</td>
                    <td className="num">{p.proposed_duration_months ?? '—'}</td>
                    <td className="num">{bdt(p.proposed_installment)}</td>
                    <td>{p.old_mcl ?? '—'}</td>
                    <td>{p.prospect_date ? String(p.prospect_date).slice(0, 10) : '—'}</td>
                    <td>{p.stage}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
