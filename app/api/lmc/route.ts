import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The queue: approved proposals, and anything already through the committee. */
export async function GET(req: NextRequest) {
  const stage = req.nextUrl.searchParams.get('stage') ?? 'open';

  if (stage === 'open') {
    return NextResponse.json(await sql`
      select p.proposal_id, p.customer_name, p.business_name, p.profile_id,
             p.prospect_date as applied_date, p.proposed_loan_amount, p.proposed_duration_months,
             p.offday, p.area, f.fs_score_pct, f.approved_date as fprc_approved_date,
             l.approved_amount, l.approved_duration_months,
             l.pm_check, l.dir_check, l.contr_check, l.ceo_check, l.disbursed_date
      from v_proposals p
      join fprc f on f.proposal_id = p.proposal_id and f.approved
      left join lmc l on l.proposal_id = p.proposal_id
      where p.stage in ('Approved','Disbursed')
      order by f.approved_date desc nulls last limit 200`);
  }

  return NextResponse.json(await sql`
    select * from v_lmc order by applied_date desc nulls last limit 200`);
}

export async function PUT(req: NextRequest) {
  const b = await req.json();
  if (!b.proposal_id) {
    return NextResponse.json({ error: 'Choose a proposal first.' }, { status: 400 });
  }

  const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));
  const allChecked = !!(b.pm_check && b.dir_check && b.contr_check && b.ceo_check);

  if (b.disbursed_date && !allChecked) {
    return NextResponse.json({
      error: 'All four approvals — PM, Dir, Contr and CEO — are needed before disbursement.',
    }, { status: 400 });
  }

  try {
    await sql`
      insert into lmc (proposal_id, approved_date, approved_amount, approved_duration_months,
        pm_check, pm_time, dir_check, contr_check, ceo_check, approved_time,
        disbursed_date, start_date, end_date, actual_installment)
      values (${b.proposal_id}, ${b.approved_date || null}, ${num(b.approved_amount)},
        ${num(b.approved_duration_months)}, ${b.pm_check ?? false},
        ${b.pm_check ? new Date().toISOString() : null}, ${b.dir_check ?? false},
        ${b.contr_check ?? false}, ${b.ceo_check ?? false},
        ${allChecked ? new Date().toISOString() : null},
        ${b.disbursed_date || null}, ${b.start_date || null}, ${b.end_date || null},
        ${num(b.actual_installment)})
      on conflict (proposal_id) do update set
        approved_date = excluded.approved_date,
        approved_amount = excluded.approved_amount,
        approved_duration_months = excluded.approved_duration_months,
        pm_check = excluded.pm_check, dir_check = excluded.dir_check,
        contr_check = excluded.contr_check, ceo_check = excluded.ceo_check,
        pm_time = coalesce(lmc.pm_time, excluded.pm_time),
        approved_time = coalesce(lmc.approved_time, excluded.approved_time),
        disbursed_date = excluded.disbursed_date, start_date = excluded.start_date,
        end_date = excluded.end_date, actual_installment = excluded.actual_installment,
        updated_at = now()`;

    if (b.disbursed_date) {
      await sql`update proposals set stage = 'Disbursed', updated_at = now()
                where proposal_id = ${b.proposal_id}`;
    }

    const [row] = await sql`select * from v_lmc where proposal_id = ${b.proposal_id}`;
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
