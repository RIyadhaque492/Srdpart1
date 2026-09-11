import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Live installment preview, straight from the rate schedule. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const amount = Number(p.get('amount'));
  const months = Number(p.get('months'));
  const offday = p.get('offday') ?? 'Fri';

  if (!amount || !months || amount <= 0 || months <= 0) {
    return NextResponse.json({ error: 'amount and months are required' }, { status: 400 });
  }

  const [row] = await sql`
    select fn_installment(${amount}, ${months}, ${offday})     as installment,
           fn_total_receivable(${amount}, ${months})           as total_receivable,
           ${months}::int * (case when ${offday} = 'Fri' then 25 else 20 end) as installments,
           exists (select 1 from rate_schedule
                    where amount = ${amount} and months = ${months})          as from_schedule
  ` as any[];

  return NextResponse.json(row);
}
