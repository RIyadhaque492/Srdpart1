'use client';

import { useState, useEffect, useCallback } from 'react';

const bdt = (n: unknown) => (n == null || n === '' ? '—' : '৳' + Number(n).toLocaleString('en-IN'));
const day = (d: unknown) => (d ? String(d).slice(0, 10) : '—');

interface Queued {
  proposal_id: string; customer_name: string; business_name: string | null;
  profile_id: string; applied_date: string | null; proposed_loan_amount: string;
  proposed_duration_months: number | null; offday: string | null; area: string | null;
  fs_score_pct: string | null; fprc_approved_date: string | null;
  approved_amount: string | null; approved_duration_months: number | null;
  pm_check: boolean | null; dir_check: boolean | null;
  contr_check: boolean | null; ceo_check: boolean | null; disbursed_date: string | null;
}

interface Quote {
  installment: string; total_receivable: string; installments: number; from_schedule: boolean;
}

const CHECKS = [
  { k: 'pm_check', label: 'PM' },
  { k: 'dir_check', label: 'Dir' },
  { k: 'contr_check', label: 'Contr' },
  { k: 'ceo_check', label: 'CEO' },
] as const;

export default function Approvals() {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Queued | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('');
  const [checks, setChecks] = useState({ pm_check: false, dir_check: false, contr_check: false, ceo_check: false });
  const [approvedDate, setApprovedDate] = useState('');
  const [disbursedDate, setDisbursedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/lmc?stage=open');
      setQueue(await res.json());
    } catch { setError('Could not load the queue.'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function pick(r: Queued) {
    setPicked(r); setDone(null); setError(null);
    setAmount(r.approved_amount ?? r.proposed_loan_amount ?? '');
    setMonths(String(r.approved_duration_months ?? r.proposed_duration_months ?? ''));
    setChecks({
      pm_check: !!r.pm_check, dir_check: !!r.dir_check,
      contr_check: !!r.contr_check, ceo_check: !!r.ceo_check,
    });
    setApprovedDate(r.fprc_approved_date ? String(r.fprc_approved_date).slice(0, 10)
                                         : new Date().toISOString().slice(0, 10));
    setDisbursedDate(r.disbursed_date ? String(r.disbursed_date).slice(0, 10) : '');
    setStartDate(''); setEndDate('');
  }

  // live installment on the approved figures, not the proposed ones
  useEffect(() => {
    const a = Number(amount), m = Number(months);
    if (!a || !m || !picked) { setQuote(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quote?amount=${a}&months=${m}&offday=${picked.offday ?? 'Fri'}`);
        setQuote(res.ok ? await res.json() : null);
      } catch { setQuote(null); }
    }, 250);
    return () => clearTimeout(t);
  }, [amount, months, picked]);

  const allChecked = CHECKS.every((c) => checks[c.k]);

  async function save(withDisbursement: boolean) {
    if (!picked) return;
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await fetch('/api/lmc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_id: picked.proposal_id,
          approved_date: approvedDate || null,
          approved_amount: amount || null,
          approved_duration_months: months || null,
          ...checks,
          disbursed_date: withDisbursement ? disbursedDate || null : null,
          start_date: withDisbursement ? startDate || null : null,
          end_date: withDisbursement ? endDate || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Could not save.');
      else {
        setDone(withDisbursement
          ? `${picked.proposal_id} disbursed at ${bdt(data.actual_installment)} per installment.`
          : `Saved. ${CHECKS.filter((c) => checks[c.k]).length} of 4 approvals recorded.`);
        setPicked(null);
        load();
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <h2>Loan committee</h2>
      <p className="note">
        Proposals that passed feasibility. Each of the four approvals is recorded
        separately, and disbursement is only possible once all four are in.
      </p>

      {done && <div className="msg ok">{done}</div>}
      {error && <div className="msg">{error}</div>}

      {!picked ? (
        <>
          {loading && <p className="note">Loading…</p>}
          {!loading && queue.length === 0 && (
            <p className="note">Nothing waiting. Approve a proposal in Feasibility review first.</p>
          )}
          {queue.length > 0 && (
            <>
              <p className="note">{queue.length} in the committee.</p>
              <table>
                <thead>
                  <tr>
                    <th>ID</th><th>Member</th><th className="num">Proposed</th>
                    <th className="num">Approved</th><th>Approvals</th><th>Disbursed</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((r) => {
                    const n = [r.pm_check, r.dir_check, r.contr_check, r.ceo_check].filter(Boolean).length;
                    return (
                      <tr key={r.proposal_id} onClick={() => pick(r)} style={{ cursor: 'pointer' }}>
                        <td>{r.proposal_id}</td>
                        <td>{r.customer_name}</td>
                        <td className="num">{bdt(r.proposed_loan_amount)}</td>
                        <td className="num">{bdt(r.approved_amount)}</td>
                        <td>{n} of 4</td>
                        <td>{day(r.disbursed_date)}</td>
                        <td style={{ color: 'var(--accent)' }}>Open</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
        </>
      ) : (
        <>
          <div className="picked">
            <div>
              <strong>{picked.proposal_id}</strong> · {picked.customer_name}
              <div className="hint">{picked.business_name ?? 'No business name'} · {picked.profile_id}</div>
            </div>
            <button className="quiet" onClick={() => setPicked(null)}>Back to queue</button>
          </div>

          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><th>Applied date</th><td>{day(picked.applied_date)}</td></tr>
              <tr><th>Proposed</th><td>{bdt(picked.proposed_loan_amount)} over {picked.proposed_duration_months ?? '—'} months</td></tr>
              <tr><th>Off day</th><td>{picked.offday ?? '—'}</td></tr>
              <tr><th>FS score</th><td>{picked.fs_score_pct ?? '—'}%</td></tr>
            </tbody>
          </table>

          <h3>Approved terms</h3>
          <div className="grid2">
            <div className="field">
              <label htmlFor="amt">Approved amount</label>
              <input id="amt" type="number" inputMode="numeric" value={amount}
                     onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="mon">Approved duration (months)</label>
              <input id="mon" type="number" inputMode="numeric" min={1} max={24} value={months}
                     onChange={(e) => setMonths(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="adate">Approved date</label>
              <input id="adate" type="date" value={approvedDate}
                     onChange={(e) => setApprovedDate(e.target.value)} />
            </div>
          </div>

          {quote && (
            <div className={`quote${quote.from_schedule ? '' : ' estimate'}`}>
              <div>
                <span className="big">{bdt(quote.installment)}</span>
                <span className="hint"> per installment</span>
              </div>
              <div className="hint">
                {quote.installments} installments · {bdt(quote.total_receivable)} total ·{' '}
                {quote.from_schedule ? 'from the rate schedule'
                  : 'estimated — this combination is not in the rate schedule, so check it by hand'}
              </div>
            </div>
          )}

          <h3>Approvals</h3>
          <div className="checks">
            {CHECKS.map((c) => (
              <label key={c.k} className={`check${checks[c.k] ? ' on' : ''}`}>
                <input type="checkbox" checked={checks[c.k]}
                       onChange={(e) => setChecks((s) => ({ ...s, [c.k]: e.target.checked }))} />
                {c.label}
              </label>
            ))}
          </div>
          <p className="note">
            {allChecked
              ? 'All four recorded — this loan can be disbursed.'
              : `${CHECKS.filter((c) => checks[c.k]).length} of 4. Disbursement stays locked until all four are in.`}
          </p>

          <h3>Disbursement</h3>
          <div className="grid2">
            <div className="field">
              <label htmlFor="ddate">Disbursed date</label>
              <input id="ddate" type="date" value={disbursedDate} disabled={!allChecked}
                     onChange={(e) => setDisbursedDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="sdate">Start date</label>
              <input id="sdate" type="date" value={startDate} disabled={!allChecked}
                     onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edate">End date</label>
              <input id="edate" type="date" value={endDate} disabled={!allChecked}
                     onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="quiet" onClick={() => save(false)} disabled={busy}>
              {busy ? 'Saving…' : 'Save approvals'}
            </button>
            <button onClick={() => save(true)} disabled={busy || !allChecked || !disbursedDate}>
              Record disbursement
            </button>
          </div>
        </>
      )}
    </>
  );
}
