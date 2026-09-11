import { sql } from '@/lib/db';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const [c] = await sql`
    select
      (select count(*) from members)                                        as members,
      (select count(*) from members where profile_date > now() - interval '30 days') as recent,
      (select count(*) from members where area_code is null
          or zone_id is null or nid_no is null)                             as incomplete,
      (select count(distinct area_code) from members where area_code is not null) as areas
  ` as any[];

  const latest = await sql`
    select profile_id, member_name, primary_contact, business_name, area_code, profile_date
    from members order by profile_id desc limit 8` as any[];

  return (
    <>
      <div className="rail">
        <div className="stage live">
          <span className="n">{c.members}</span>
          <span className="t">Members on file</span>
        </div>
        <div className="stage">
          <span className="n">{c.recent}</span>
          <span className="t">Added in last 30 days</span>
        </div>
        <div className="stage">
          <span className="n">{c.incomplete}</span>
          <span className="t">Missing area, zone or NID</span>
        </div>
        <div className="stage">
          <span className="n">{c.areas}</span>
          <span className="t">Areas covered</span>
        </div>
      </div>

      <p className="note">
        Step one is the member register. <Link href="/members/new">Add a member</Link> one
        at a time, or <Link href="/members/new">upload a workbook</Link> to bring in many at once.
        Loans and collections come later, once this list is right.
      </p>

      <h2>Recently added</h2>
      {latest.length === 0 ? (
        <p className="note">Nothing here yet.</p>
      ) : (
        <table>
          <thead>
            <tr><th>Profile</th><th>Name</th><th>Contact</th><th>Business</th><th>Area</th></tr>
          </thead>
          <tbody>
            {latest.map((m) => (
              <tr key={m.profile_id}>
                <td>{m.profile_id}</td>
                <td>{m.member_name}</td>
                <td>{m.primary_contact ?? '—'}</td>
                <td>{m.business_name ?? '—'}</td>
                <td>{m.area_code ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
