'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Row {
  portfolio_no: string; profile_id: string | null; member_name: string | null;
  investment_amount: string | null; disbursed_date: string | null; end_date: string | null;
  duration_months: number | null; instl_amount: string | null;
  total_collected: string | null; outstandings: string | null;
  status: string | null; area_code: string | null;
}
interface Coll {
  id: number; transaction_date: string | null; amount: string;
  installment: string | null; particulars: string | null; entry_by: string | null;
}
interface Data {
  rows: Row[];
  summary: { total: string; invested: string; collected: string; outstanding: string };
  statuses: { status: string; n: string }[];
  areas: { area_code: string }[];
}

const bdt = (n: unknown) => (n == null ? '—' : '৳' + Number(n).toLocaleString('en-IN'));
const day = (d: string | null) => (d ? String(d).slice(0, 10) : '—');

export default function Portfolio() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [colls, setColls] = useState<Coll[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ q, status, area });
      const res = await fetch(`/api/portfolios?${qs}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setData(await res.json());
    } catch (e) {
      setError(`Could not load portfolios: ${(e as Error).message}`);
    } finally { setLoading(false); }
  }, [q, status, area]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function toggle(no: string) {
    if (open === no) { setOpen(null); return; }
    setOpen(no); setColls(null);
    try {
      const res = await fetch(`/api/portfolios?no=${encodeURIComponent(no)}`);
      setColls(res.ok ? await res.json() : []);
    } catch { setColls([]); }
  }

  const s = data?.summary;

  return (
    <>
      <h2>Portfolio</h2>
      <p className="note">
        Every disbursed loan with what has been collected and what is still owed.
        Tap a row for its latest collections, or its number for the full ledger.
      </p>

      {error && <div className="msg">{error}</div>}

      {s && (
        <div className="pipe">
          <div className="gate"><span className="n">{Number(s.total).toLocaleString('en-IN')}</span><span className="t">Portfolios</span></div>
          <div className="gate"><span className="n">{bdt(s.invested)}</span><span className="t">Invested</span></div>
          <div className="gate"><span className="n">{bdt(s.collected)}</span><span className="t">Collected</span></div>
          <div className="gate live"><span className="n">{bdt(s.outstanding)}</span><span className="t">Outstanding</span></div>
        </div>
      )}

      <div className="grid2" style={{ marginBottom: 16 }}>
        <div className="field">
          <label htmlFor="q">Search by member, Portfolio No or Profile ID</label>
          <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
        </div>
        <div className="field">
          <label htmlFor="st">Status</label>
          <select id="st" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {data?.statuses.map((x) => <option key={x.status} value={x.status}>{x.status} ({x.n})</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="ar">Area</label>
          <select id="ar" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {data?.areas.map((x) => <option key={x.area_code} value={x.area_code}>{x.area_code}</option>)}
          </select>
        </div>
      </div>

      {loading && <p className="note">Loading…</p>}
      {!loading && data && data.rows.length === 0 && (
        <p className="note">No portfolios found. If the table is empty, load the <code>5.Portfolio</code> sheet on the <Link href="/import">Import</Link> page.</p>
      )}

      {data && data.rows.length > 0 && (
        <div className="scroller">
          <table>
            <thead>
              <tr>
                <th>PF No</th><th>Member</th><th className="num">Investment</th>
                <th>Disbursed</th><th>Ends</th><th className="num">Installment</th>
                <th className="num">Collected</th><th className="num">Outstanding</th>
                <th>Status</th><th>Area</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Fragment key={r.portfolio_no}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggle(r.portfolio_no)}>
                    <td><Link href={`/portfolio/${r.portfolio_no}`} onClick={(e) => e.stopPropagation()}>{r.portfolio_no}</Link></td>
                    <td>{r.member_name ?? r.profile_id ?? '—'}</td>
                    <td className="num">{bdt(r.investment_amount)}</td>
                    <td>{day(r.disbursed_date)}</td>
                    <td>{day(r.end_date)}</td>
                    <td className="num">{bdt(r.instl_amount)}</td>
                    <td className="num">{bdt(r.total_collected)}</td>
                    <td className="num">{bdt(r.outstandings)}</td>
                    <td>{r.status ?? '—'}</td>
                    <td>{r.area_code ?? '—'}</td>
                  </tr>
                  {open === r.portfolio_no && (
                    <tr>
                      <td colSpan={10}>
                        {colls === null && <span className="hint">Loading collections…</span>}
                        {colls && colls.length === 0 && <span className="hint">No collections recorded for this portfolio.</span>}
                        {colls && colls.length > 0 && (
                          <table>
                            <thead><tr><th>Date</th><th className="num">Amount</th><th className="num">Installment</th><th>Particulars</th><th>By</th></tr></thead>
                            <tbody>
                              {colls.map((c) => (
                                <tr key={c.id}>
                                  <td>{day(c.transaction_date)}</td>
                                  <td className="num">{bdt(c.amount)}</td>
                                  <td className="num">{bdt(c.installment)}</td>
                                  <td>{c.particulars ?? '—'}</td>
                                  <td>{c.entry_by ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
