'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PF_COLUMNS, showPf } from '@/lib/portfolioColumns';

// Columns A to AF of the Portfolio sheet are the first 32 entries of PF_COLUMNS.
const FIRST = 32;

interface Row {
  [key: string]: unknown;
  portfolio_no: string;
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
const day = (d: unknown) => (d ? String(d).slice(0, 10) : '—');

/** 0 → A, 25 → Z, 26 → AA, 31 → AF */
function letter(i: number): string {
  let s = '';
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

export default function Portfolio() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [area, setArea] = useState('');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [colls, setColls] = useState<Coll[] | null>(null);

  const cols = more ? PF_COLUMNS : PF_COLUMNS.slice(0, FIRST);
  const align = (k: string) => (k === 'text' || k === 'date' ? '' : 'num');

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const qs = new URLSearchParams({ q, status, area, all: '1', limit: '3000' });
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
        Columns A to AF of the Portfolio sheet. Scroll sideways to see them all. Tap a row for its
        latest collections, or its number for the full ledger.
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

      <label className="hint" style={{ display: 'block', marginBottom: 12 }}>
        <input type="checkbox" checked={more} onChange={(e) => setMore(e.target.checked)} />{' '}
        Also show the remaining {PF_COLUMNS.length - FIRST} columns ({letter(FIRST)} onward)
      </label>

      {loading && <p className="note">Loading…</p>}
      {!loading && data && data.rows.length === 0 && (
        <p className="note">No portfolios found. If the table is empty, load the <code>5.Portfolio</code> sheet on the <Link href="/import">Import</Link> page.</p>
      )}

      {data && data.rows.length > 0 && (
        <div className="scroller">
          <table>
            <thead>
              <tr>
                {cols.map((c, i) => (
                  <th key={c.key} className={align(c.kind)}>
                    <span className="hint" style={{ display: 'block', fontWeight: 400 }}>{i < FIRST ? letter(i) : ''}</span>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <Fragment key={r.portfolio_no}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => toggle(r.portfolio_no)}>
                    {cols.map((c) => (
                      <td key={c.key} className={align(c.kind)}>
                        {c.key === 'portfolio_no'
                          ? <Link href={`/portfolio/${r.portfolio_no}`} onClick={(e) => e.stopPropagation()}>{r.portfolio_no}</Link>
                          : c.key === 'member_name'
                            ? String(r.display_name ?? r.member_name ?? r.profile_id ?? '—')
                            : showPf(r[c.key], c.kind)}
                      </td>
                    ))}
                  </tr>
                  {open === r.portfolio_no && (
                    <tr>
                      <td colSpan={cols.length}>
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
