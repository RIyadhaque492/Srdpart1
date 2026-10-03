import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { CASH_TYPES } from '@/lib/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One portfolio's ledger: the loan, the member, every collection with a running cash total. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ no: string }> }) {
  const { no } = await params;

  const [loan] = await sql`
    select pf.*, m.member_name, m.business_name, m.primary_contact, m.religion,
           m.present_address, z.name as zone, cat.name as category
    from portfolios pf
    left join members m on m.profile_id = pf.profile_id
    left join zones z on z.id = m.zone_id
    left join categories cat on cat.code = m.category_code
    where pf.portfolio_no = ${no}` as any[];
  if (!loan) return NextResponse.json({ error: `Portfolio ${no} is not on file.` }, { status: 404 });

  const [entries, byType] = await Promise.all([
    sql.query(
      `select id, transaction_date, particulars, amount, checked, audited,
              sum(case when particulars = any($2) then amount else 0 end)
                over (order by transaction_date, id rows between unbounded preceding and current row)
                as cash_to_date
       from collections where portfolio_no = $1
       order by transaction_date, id`, [no, [...CASH_TYPES]]),
    sql`select coalesce(particulars, 'Other') as particulars, count(*) as n, sum(amount) as total
        from collections where portfolio_no = ${no}
        group by 1 order by total desc`,
  ]);

  return NextResponse.json({ loan, entries, byType });
}
