'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { matches } from '@/lib/text';

const CASH = ['Regular Collection', 'Due Collection', 'Settlement Collection', 'Legal Collection'];

interface Pf {
  profile_id?: string | null; contact?: string | null;
  portfolio_no: string; member_name: string | null; instl_amount: string | null;
  outstandings: string | null; status: string | null;
}
interface Row {
  id: number; portfolio_no: string; member_name: string | null; transaction_date: string | null;
  amount: string; particulars: string | null; entry_by: string | null;
  checked: boolean; audited: boolean; app_entry: boolean;
}

const bdt = (n: unknown) => (n == null || n === '' ? '—' : '৳' + Number(n).toLocaleString('en-IN'));
const day = (d: unknown) => (d ? String(d).slice(0, 10) : '—');
const todayLocal = () => new Date().toLocaleDateString('en-CA');

export default function Collections() {
  // ---- record form
  const [loans, setLoans] = useState<Pf[] | null>(null);
  const [find, setFind] = useState('');
  const [pf, setPf] = useState<Pf | null>(null);
  const [today, setToday] = useState<{ n: string; cash: string } | null>(null);
  const [date, setDate] = useState(todayLocal());
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState(CASH[0]);
  const [remarks, setRemarks] = useState('');
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // ---- list
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [cash, setCash] = useState<string>('0');
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ q, from, to });
      const res = await fetch(`/api/collections?${qs}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const d = await res.json();
      setRows(d.rows); setCash(d.summary.cash); setToday(d.today ?? null);
    } catch (e) {
      setMsg({ ok: false, text: `Could not load collections: ${(e as Error).message}` });
    } finally { setLoading(false); }
  }, [q, from, to]);

  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [load]);

  // Every running loan is loaded once and filtered in the browser, so the whole
  // list is visible and narrows as you type (member, Portfolio No, Profile ID, contact).
  const loadLoans = useCallback(async (): Promise<Pf[]> => {
    try {
      const res = await fetch('/api/portfolios?status=Running&limit=3000');
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const d = await res.json();
      setLoans(d.rows);
      return d.rows as Pf[];
    } catch (e) {
      setMsg({ ok: false, text: `Could not load running loans: ${(e as Error).message}` });
      setLoans([]);
      return [];
    }
  }, []);

  // arrive from a ledger with ?pf=1234
  useEffect(() => {
    loadLoans().then((list) => {
      const no = new URLSearchParams(window.location.search).get('pf');
      const hit = no ? list.find((r) => r.portfolio_no === no) : undefined;
      if (hit) choose(hit);
    });
  }, [loadLoans]);  // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(
    () => (loans ?? []).filter((l) => matches([l.portfolio_no, l.profile_id, l.member_name, l.contact], find)),
    [loans, find],
  );

  function choose(p: Pf) {
    setPf(p); setFind(''); setConfirm(null); setMsg(null);
    setAmount(p.instl_amount ? String(Math.round(Number(p.instl_amount))) : '');
  }

  async function save(allow = false) {
    if (!pf) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/collections', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portfolio_no: pf.portfolio_no, transaction_date: date, amount,
          particulars: kind, remarks, allow_excess: allow }),
      });
      const d = await res.json();
      if (res.status === 409 && d.needs_confirm) { setConfirm(d.error); return; }
      if (!res.ok) { setMsg({ ok: false, text: d.error ?? 'Could not save.' }); return; }
      setConfirm(null);
      setMsg({ ok: true, text: `Recorded ${bdt(amount)} for portfolio ${pf.portfolio_no}.` +
        (d.status === 'Loan Finished' ? ' The loan is now fully paid.' : '') });
      setPf({ ...pf, outstandings: d.outstandings, status: d.status });
      // keep the list live: a finished loan leaves it, others show the new balance
      setLoans((prev) => prev && (d.status === 'Loan Finished'
        ? prev.filter((l) => l.portfolio_no !== pf.portfolio_no)
        : prev.map((l) => l.portfolio_no === pf.portfolio_no ? { ...l, outstandings: d.outstandings } : l)));
      setAmount(''); setRemarks('');
      load();
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server. Check your connection and try again.' });
    } finally { setBusy(false); }
  }

  async function step(action: 'check' | 'audit') {
    const res = await fetch('/api/collections', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(picked), action }),
    });
    const d = await res.json();
    if (!res.ok) setMsg({ ok: false, text: d.error ?? 'Could not update.' });
    else {
      setMsg({ ok: true, text: `${d.updated} marked ${action === 'check' ? 'checked' : 'audited'}.` +
        (d.skipped ? ` ${d.skipped} skipped — audit needs the check first.` : '') });
      setPicked(new Set()); load();
    }
  }

  async function reverse(r: Row) {
    if (!window.confirm(`Reverse ${bdt(r.amount)} on portfolio ${r.portfolio_no}? The loan balance will be restored.`)) return;
    const res = await fetch(`/api/collections?id=${r.id}`, { method: 'DELETE' });
    const d = await res.json();
    if (!res.ok) setMsg({ ok: false, text: d.error ?? 'Could not reverse.' });
    else {
      setMsg({ ok: true, text: 'Collection reversed.' });
      loadLoans().then((list) => {
        const m = list.find((x) => x.portfolio_no === r.portfolio_no);
        if (pf?.portfolio_no === r.portfolio_no && m) setPf(m);
      });
      load();
    }
  }

  function toggle(id: number) {
    setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  return (
    <>
      <h2>Collections</h2>
      <p className="note">
        Record what a member has paid. The loan&apos;s collected and outstanding totals update
        with it. Mistakes made here can be reversed until the entry is audited.
      </p>

      {msg && <div className={`msg${msg.ok ? ' ok' : ''}`}>{msg.text}</div>}

      {today && (
        <p className="note">
          Today: <strong>{Number(today.n).toLocaleString('en-IN')}</strong> entries · cash collected <strong>{bdt(today.cash)}</strong>
        </p>
      )}

      <h3>Record a collection</h3>
      {!pf ? (
        <>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="find">Search by member, Portfolio No, Profile ID or contact</label>
            <input id="find" value={find} onChange={(e) => setFind(e.target.value)}
                   placeholder="Type to narrow the list…" autoComplete="off" inputMode="search" />
            <span className="hint">
              {loans ? (find ? `${shown.length} of ${loans.length} running loans` : `${loans.length} running loans`) : 'Loading loans…'}
            </span>
          </div>
          {loans && shown.length === 0 && <p className="note">No running loan matches.</p>}
          {shown.length > 0 && (
            <div className="scroller" style={{ maxHeight: 420, overflowY: 'auto', maxWidth: 720 }}>
              <table>
                <thead><tr><th>PF No</th><th>Member</th><th className="num">Installment</th><th className="num">Outstanding</th><th /></tr></thead>
                <tbody>
                  {shown.map((h) => (
                    <tr key={h.portfolio_no} onClick={() => choose(h)} style={{ cursor: 'pointer' }}>
                      <td>{h.portfolio_no}</td>
                      <td>{h.member_name ?? h.profile_id ?? 'Unknown member'}</td>
                      <td className="num">{bdt(h.instl_amount)}</td>
                      <td className="num">{bdt(h.outstandings)}</td>
                      <td style={{ color: 'var(--accent)' }}>Choose</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="picked" style={{ marginBottom: 16 }}>
            <div>
              <strong>{pf.portfolio_no} · {pf.member_name ?? 'Unknown member'}</strong>
              <div className="hint">
                Outstanding {bdt(pf.outstandings)} · installment {bdt(pf.instl_amount)} · {pf.status}
                {' · '}<Link href={`/portfolio/${pf.portfolio_no}`}>Ledger</Link>
              </div>
            </div>
            <button className="quiet" onClick={() => { setPf(null); setConfirm(null); }}>Change</button>
          </div>

          <div className="grid2" style={{ maxWidth: 640 }}>
            <div className="field">
              <label htmlFor="d">Transaction date</label>
              <input id="d" type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="a">Amount (৳)</label>
              <input id="a" type="number" min="1" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="k">Type</label>
              <select id="k" value={kind} onChange={(e) => setKind(e.target.value)}>
                {CASH.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="r">Remarks (optional)</label>
              <input id="r" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          </div>

          {confirm && (
            <div className="msg">
              {confirm} Record it anyway?{' '}
              <button onClick={() => save(true)} disabled={busy}>Yes, record</button>
            </div>
          )}
          <button onClick={() => save(false)} disabled={busy || !amount}>{busy ? 'Saving…' : 'Record collection'}</button>
        </>
      )}

      <h3 style={{ marginTop: 32 }}>Collection history</h3>
      <div className="grid2" style={{ marginBottom: 12 }}>
        <div className="field">
          <label htmlFor="q">Search by member or Portfolio No</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
        </div>
        <div className="grid2">
          <div className="field"><label htmlFor="f">From</label><input id="f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label htmlFor="t">To</label><input id="t" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>
      <p className="note">Cash collected in this view: <strong>{bdt(cash)}</strong> (showing the latest 200 rows)</p>

      {picked.size > 0 && (
        <div className="picked" style={{ marginBottom: 16 }}>
          <strong>{picked.size} selected</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => step('check')}>Mark checked</button>
            <button onClick={() => step('audit')}>Mark audited</button>
            <button className="quiet" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        </div>
      )}

      {loading && <p className="note">Loading…</p>}
      {!loading && rows.length === 0 && <p className="note">No collections found. Import the <Link href="/import">Collections sheet</Link> or record one above.</p>}
      {rows.length > 0 && (
        <div className="scroller">
          <table>
            <thead><tr>
              <th style={{ width: 40 }} /><th>Date</th><th>PF No</th><th>Member</th>
              <th className="num">Amount</th><th>Type</th><th>By</th><th>Status</th><th />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><input type="checkbox" aria-label={`Select ${r.id}`} checked={picked.has(r.id)} onChange={() => toggle(r.id)} /></td>
                  <td>{day(r.transaction_date)}</td>
                  <td><Link href={`/portfolio/${r.portfolio_no}`}>{r.portfolio_no}</Link></td>
                  <td>{r.member_name ?? '—'}</td>
                  <td className="num">{bdt(r.amount)}</td>
                  <td>{r.particulars ?? '—'}</td>
                  <td>{r.entry_by ?? '—'}</td>
                  <td>{r.audited ? 'Audited' : r.checked ? 'Checked' : 'Entered'}</td>
                  <td>{r.app_entry && !r.audited && <button className="danger" onClick={() => reverse(r)}>Reverse</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
