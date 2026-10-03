import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolios?q=&status=&area=   -> list + summary + filter options
 * GET /api/portfolios?no=<portfolio_no>  -> that portfolio's collections
 */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const no = (p.get('no') ?? '').trim();
  if (no) {
    const rows = await sql`
      select id, transaction_date, amount, installment, particulars, entry_by, remarks
      from collections where portfolio_no = ${no}
      order by transaction_date desc nulls last, id desc limit 50`;
    return NextResponse.json(rows);
  }

  const q = (p.get('q') ?? '').trim();
  const status = (p.get('status') ?? '').trim();
  const area = (p.get('area') ?? '').trim();

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push('%' + q + '%');
    const i = params.length;
    where.push(`(m.member_name ilike $${i} or pf.portfolio_no ilike $${i} or pf.profile_id ilike $${i})`);
  }
  if (status) { params.push(status); where.push(`pf.status = $${params.length}`); }
  if (area)   { params.push(area);   where.push(`pf.area_code = $${params.length}`); }
  const w = where.length ? 'where ' + where.join(' and ') : '';

  const [rows, summary, statuses, areas] = await Promise.all([
    sql.query(
      `select pf.portfolio_no, pf.profile_id, m.member_name, pf.investment_amount,
              pf.disbursed_date, pf.end_date, pf.duration_months, pf.instl_amount,
              pf.total_collected, pf.outstandings, pf.status, pf.area_code
       from portfolios pf left join members m on m.profile_id = pf.profile_id
       ${w}
       order by pf.disbursed_date desc nulls last, pf.portfolio_no desc limit 200`, params),
    sql.query(
      `select count(*) as total,
              coalesce(sum(pf.investment_amount),0) as invested,
              coalesce(sum(pf.total_collected),0)   as collected,
              coalesce(sum(pf.outstandings),0)      as outstanding
       from portfolios pf left join members m on m.profile_id = pf.profile_id ${w}`, params),
    sql`select status, count(*) as n from portfolios where status is not null
        group by status order by n desc`,
    sql`select distinct area_code from portfolios where area_code is not null order by 1`,
  ]);

  return NextResponse.json({ rows, summary: (summary as any[])[0], statuses, areas });
}
