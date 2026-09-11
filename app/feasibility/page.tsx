'use client';

import { useState, useEffect, useCallback } from 'react';

const bdt = (n: unknown) => (n == null || n === '' ? '—' : '৳' + Number(n).toLocaleString('en-IN'));
const day = (d: unknown) => (d ? String(d).slice(0, 10) : '—');

interface Queued {
  proposal_id: string; customer_name: string; business_name: string | null;
  prospect_date: string | null; proposed_loan_amount: string;
  proposed_duration_months: number | null; area: string | null; zone: string | null;
  mem_pf: number | null; old_loan_amount: string | null; cr_score: string | null;
  stage: string; rfp_date: string | null; feasibility_score: string | null;
  approved: boolean | null; rejected: boolean | null;
}

const BLANK = {
  rfp_date: new Date().toISOString().slice(0, 10),
  feasibility_date: new Date().toISOString().slice(0, 10),
  cr_score: '', regularity_score: '', performance_score: '',
  risk_score: '', feasibility_score: '', fs_score_pct: '',
  active_rating: '', ai_remarks: '', comments: '',
  approved_date: new Date().toISOString().slice(0, 10),
};

export default function Feasibility() {
  const [queue, setQueue] = useState<Queued[]>([]);
  const [loading, setLoading] = useState(true);
  const [picked, setPicked] = useState<Queued | null>(null);
  const [form, setForm] = useState({ ...BLANK });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/fprc?stage=open');
      setQueue(await res.json());
    } catch { setError('Could not load the queue.'); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function pick(row: Queued) {
    setPicked(row);
    setDone(null); setError(null);
    setForm({
      ...BLANK,
      cr_score: row.cr_score ?? '',
      feasibility_score: row.feasibility_score ?? '',
      rfp_date: row.rfp_date ? String(row.rfp_date).slice(0, 10) : BLANK.rfp_date,
    });
  }

  const set = (k: keyof typeof BLANK, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(decision: 'approve' | 'reject' | 'save') {
    if (!picked) return;
    setBusy(true); setError(null); setDone(null);
    try {
      const res = await fetch('/api/fprc', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal_id: picked.proposal_id,
          ...form,
          previous_loan_amount: picked.old_loan_amount,
          approved: decision === 'approve',
          rejected: decision === 'reject',
          approved_date: decision === 'approve' ? form.approved_date : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Could not save.');
      else {
        setDone(decision === 'approve' ? `${picked.proposal_id} approved — it now goes to the loan committee.`
              : decision === 'reject' ? `${picked.proposal_id} rejected.`
              : `Scores saved for ${picked.proposal_id}.`);
        setPicked(null);
        load();
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  const change = picked && picked.old_loan_amount
    ? ((Number(picked.proposed_loan_amount) - Number(picked.old_loan_amount))
        / Number(picked.old_loan_amount) * 100)
    : null;

  const N = ({ k, label, hint }: { k: keyof typeof BLANK; label: string; hint?: string }) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} type="number" step="0.01" value={form[k]}
             onChange={(e) => set(k, e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <>
      <h2>Feasibility review</h2>
      <p className="note">
        Proposals waiting on a decision. Client details, previous loan and the
        increase come from the proposal — only the scores and the decision are entered here.
      </p>

      {done && <div className="msg ok">{done}</div>}
      {error && <div className="msg">{error}</div>}

      {!picked ? (
        <>
          {loading && <p className="note">Loading…</p>}
          {!loading && queue.length === 0 && (
            <p className="note">Nothing waiting. Every proposal has been through feasibility.</p>
          )}
          {queue.length > 0 && (
            <>
              <p className="note">{queue.length} waiting.</p>
              <table>
                <thead>
                  <tr>
                    <th>ID</th><th>Member</th><th className="num">Amount</th>
                    <th className="num">Months</th><th>Area</th><th>Prospect date</th>
                    <th>Stage</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((r) => (
                    <tr key={r.proposal_id} onClick={() => pick(r)} style={{ cursor: 'pointer' }}>
                      <td>{r.proposal_id}</td>
                      <td>{r.customer_name}</td>
                      <td className="num">{bdt(r.proposed_loan_amount)}</td>
                      <td className="num">{r.proposed_duration_months ?? '—'}</td>
                      <td>{r.area ?? '—'}</td>
                      <td>{day(r.prospect_date)}</td>
                      <td>{r.stage}</td>
                      <td style={{ color: 'var(--accent)' }}>Review</td>
                    </tr>
                  ))}
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
              <div className="hint">{picked.business_name ?? 'No business name'}</div>
            </div>
            <button className="quiet" onClick={() => setPicked(null)}>Back to queue</button>
          </div>

          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><th>Prospect date</th><td>{day(picked.prospect_date)}</td></tr>
              <tr><th>Area / Zone</th><td>{picked.area ?? '—'} · {picked.zone ?? '—'}</td></tr>
              <tr><th>Previous loans</th><td>{picked.mem_pf ?? 0}</td></tr>
              <tr><th>Previous loan amount</th><td>{bdt(picked.old_loan_amount)}</td></tr>
              <tr><th>Proposed amount</th><td>{bdt(picked.proposed_loan_amount)} over {picked.proposed_duration_months ?? '—'} months</td></tr>
              <tr>
                <th>Increase / decrease</th>
                <td style={{ color: change == null ? undefined : change >= 0 ? 'var(--accent)' : 'var(--alert)' }}>
                  {change == null ? 'First loan' : `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`}
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Scores</h3>
          <p className="note">
            The SRD marks CR, Regularity and Performance as still to be built. They are
            entered by hand for now; once collections are loaded they can be computed
            from repayment history instead.
          </p>
          <div className="grid2">
            <div className="field">
              <label htmlFor="rfp_date">RFP date</label>
              <input id="rfp_date" type="date" value={form.rfp_date}
                     onChange={(e) => set('rfp_date', e.target.value)} />
              <span className="hint">Request for Feasibility Process</span>
            </div>
            <div className="field">
              <label htmlFor="feasibility_date">Feasibility date</label>
              <input id="feasibility_date" type="date" value={form.feasibility_date}
                     onChange={(e) => set('feasibility_date', e.target.value)} />
            </div>
            <N k="cr_score" label="CR score" />
            <N k="regularity_score" label="Regularity score" hint="RS Matrix 5.0" />
            <N k="performance_score" label="Performance score" />
            <N k="risk_score" label="Risk score" />
            <N k="feasibility_score" label="Feasibility score" />
            <N k="fs_score_pct" label="FS score %" />
            <div className="field">
              <label htmlFor="active_rating">Active rating</label>
              <input id="active_rating" value={form.active_rating}
                     onChange={(e) => set('active_rating', e.target.value)} placeholder="A, B+, C…" />
            </div>
            <div className="field">
              <label htmlFor="approved_date">Approved date</label>
              <input id="approved_date" type="date" value={form.approved_date}
                     onChange={(e) => set('approved_date', e.target.value)} />
            </div>
          </div>

          <h3>Notes</h3>
          <div className="field">
            <label htmlFor="ai_remarks">Remarks and suggestions</label>
            <input id="ai_remarks" value={form.ai_remarks}
                   onChange={(e) => set('ai_remarks', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="comments">Comments</label>
            <input id="comments" value={form.comments}
                   onChange={(e) => set('comments', e.target.value)} />
          </div>

          <div style={{ marginTop: 22, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => submit('approve')} disabled={busy}>
              {busy ? 'Saving…' : 'Approve'}
            </button>
            <button className="quiet" onClick={() => submit('save')} disabled={busy}>
              Save scores only
            </button>
            <button className="danger" onClick={() => submit('reject')} disabled={busy}>
              Reject
            </button>
          </div>
        </>
      )}
    </>
  );
}
