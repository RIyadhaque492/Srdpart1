'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const bdt = (n: unknown) => (n == null || n === '' ? '—' : '৳' + Number(n).toLocaleString('en-IN'));
const day = (d: unknown) => (d ? String(d).slice(0, 10) : '—');

export default function Ledger() {
  const { no } = useParams<{ no: string }>();
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portfolios/${encodeURIComponent(no)}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `Server returned ${r.status}`); setD(j); })
      .catch((e) => setError(e.message));
  }, [no]);

  if (error) return <><h2>Ledger</h2><div className="msg">{error}</div><Link href="/portfolio">Back to portfolios</Link></>;
  if (!d) return <p className="note">Loading…</p>;

  const { loan: l, entries, byType } = d;
  const payable = Number(l.investment_amount ?? 0) + Number(l.service_charge ?? 0);
  const facts: [string, React.ReactNode][] = [
    ['Member', l.member_name ?? l.profile_id ?? '—'],
    ['Profile ID', l.profile_id ?? '—'],
    ['Business', l.business_name ?? '—'],
    ['Contact', l.primary_contact ?? '—'],
    ['Area / zone', `${l.area_code ?? '—'} · ${l.zone ?? '—'}`],
    ['Category', l.category ?? '—'],
    ['Loan amount', bdt(l.investment_amount)],
    ['Service charge', bdt(l.service_charge)],
    ['Total payable', bdt(payable)],
    ['Duration', l.duration_months ? `${l.duration_months} months` : '—'],
    ['Daily installment', bdt(l.instl_amount)],
    ['Off day', l.off_day ?? '—'],
    ['Disbursed', day(l.disbursed_date)],
    ['Start → end', `${day(l.start_date)} → ${day(l.end_date)}`],
    ['Status', l.status ?? '—'],
    ['Total collected', bdt(l.total_collected)],
    ['Outstanding', bdt(l.outstandings)],
  ];

  return (
    <>
      <p className="hint"><Link href="/portfolio">← Portfolios</Link></p>
      <h2>Portfolio {l.portfolio_no}</h2>

      <div className="grid2" style={{ marginBottom: 16 }}>
        {facts.map(([k, v]) => (
          <p key={k} className="note" style={{ margin: '2px 0' }}><span className="hint">{k}: </span>{v}</p>
        ))}
      </div>

      {l.status !== 'Loan Finished' && (
        <p><Link className="btn" href={`/collections?pf=${encodeURIComponent(l.portfolio_no)}`}>Record a collection</Link></p>
      )}

      <p className="note">
        Totals above are the loan&apos;s stored figures. The running column below adds up cash
        collections only (regular, due, settlement and legal); adjustments such as DDBS or waive-off
        are listed but not counted as cash.
      </p>

      {byType.length > 0 && (
        <div className="scroller" style={{ marginBottom: 20 }}>
          <table>
            <thead><tr><th>Type</th><th className="num">Entries</th><th className="num">Total</th></tr></thead>
            <tbody>{byType.map((t: any) => (
              <tr key={t.particulars}><td>{t.particulars}</td><td className="num">{t.n}</td><td className="num">{bdt(t.total)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <h3>Entries</h3>
      {entries.length === 0 ? <p className="note">No collections recorded for this portfolio.</p> : (
        <div className="scroller">
          <table>
            <thead><tr><th className="num">#</th><th>Date</th><th>Type</th><th className="num">Amount</th><th className="num">Cash to date</th><th>Status</th></tr></thead>
            <tbody>
              {entries.map((e: any, i: number) => (
                <tr key={e.id}>
                  <td className="num">{i + 1}</td>
                  <td>{day(e.transaction_date)}</td>
                  <td>{e.particulars ?? '—'}</td>
                  <td className="num">{bdt(e.amount)}</td>
                  <td className="num">{bdt(e.cash_to_date)}</td>
                  <td>{e.audited ? 'Audited' : e.checked ? 'Checked' : 'Entered'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
