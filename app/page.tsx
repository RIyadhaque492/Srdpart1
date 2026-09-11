import { sql } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

const bdt = (n: unknown) => '৳' + Number(n ?? 0).toLocaleString('en-IN');

export default async function Page() {
  const [c] = await sql`
    select
      (select count(*) from members)                                       as members,
      (select count(*) from proposals where stage in ('Prospect','FPRC'))  as feasibility,
      (select count(*) from proposals p join fprc f
         on f.proposal_id = p.proposal_id and f.approved
       where p.stage = 'Approved')                                         as committee,
      (select count(*) from proposals where stage = 'Disbursed')           as disbursed,
      (select coalesce(sum(approved_amount), 0) from lmc
        where disbursed_date is not null)                                  as lent,
      (select count(*) from members
        where area_code is null or zone_id is null or nid_no is null)      as incomplete
  ` as any[];

  const latest = await sql`
    select proposal_id, customer_name, proposed_loan_amount,
           proposed_duration_months, prospect_date, stage
    from v_proposals order by prospect_date desc nulls last limit 8` as any[];

  return (
    <>
      <h2>Where every loan stands</h2>
      <p className="note">
        A proposal moves left to right. The green gate is what needs attention today.
      </p>

      <div className="pipe">
        <div className="gate">
          <span className="n">{c.members}</span>
          <span className="t">Members on file</span>
        </div>
        <div className={`gate${Number(c.feasibility) > 0 ? ' live' : ''}`}>
          <span className="n">{c.feasibility}</span>
          <span className="t">Awaiting feasibility</span>
        </div>
        <div className={`gate${Number(c.committee) > 0 ? ' live' : ''}`}>
          <span className="n">{c.committee}</span>
          <span className="t">With the committee</span>
        </div>
        <div className="gate">
          <span className="n">{c.disbursed}</span>
          <span className="t">Disbursed</span>
        </div>
      </div>

      <p className="note">
        {bdt(c.lent)} lent to date.
        {Number(c.incomplete) > 0 && (
          <> {c.incomplete} member records are missing an area, zone or NID —{' '}
            <Link href="/members">check them</Link>.</>
        )}
      </p>

      <h3>Latest proposals</h3>
      {latest.length === 0 ? (
        <p className="note">
          No proposals yet. <Link href="/proposals/new">Create the first one</Link>.
        </p>
      ) : (
        <div className="scroller">
          <table>
            <thead>
              <tr>
                <th>ID</th><th>Member</th><th className="num">Amount</th>
                <th className="num">Months</th><th>Date</th><th>Stage</th>
              </tr>
            </thead>
            <tbody>
              {latest.map((p) => (
                <tr key={p.proposal_id}>
                  <td>{p.proposal_id}</td>
                  <td>{p.customer_name}</td>
                  <td className="num">{bdt(p.proposed_loan_amount)}</td>
                  <td className="num">{p.proposed_duration_months ?? '—'}</td>
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
