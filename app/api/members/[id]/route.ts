import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Everything the proposal form needs once a member is chosen: their own
 *  details, and the portfolios that feed OldMCL and the last-loan figures. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [member] = await sql`
    select m.profile_id, m.member_name, m.business_name, m.primary_contact,
           m.area_code, m.zone_id, m.category_code, m.off_day,
           z.name as zone_name, c.name as category_name,
           v.no_of_portfolios, v.last_portfolio, v.pf_status,
           v.lfd, v.led, v.lsd, v.old_loan_amount
    from members m
    left join zones z on z.id = m.zone_id
    left join categories c on c.code = m.category_code
    left join v_member_portfolio v on v.profile_id = m.profile_id
    where m.profile_id = ${id}` as any[];

  if (!member) return NextResponse.json({ error: 'No such member.' }, { status: 404 });

  const portfolios = await sql`
    select portfolio_no, investment_amount, status, disbursed_date, end_date
    from portfolios where profile_id = ${id}
    order by disbursed_date desc nulls last limit 20`;

  return NextResponse.json({ member, portfolios });
}
