import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The queue: proposals waiting on feasibility, plus anything already scored. */
export async function GET(req: NextRequest) {
  const stage = req.nextUrl.searchParams.get('stage') ?? 'open';

  if (stage === 'open') {
    return NextResponse.json(await sql`
      select p.proposal_id, p.customer_name, p.business_name, p.prospect_date,
             p.proposed_loan_amount, p.proposed_duration_months, p.area, p.zone,
             p.mem_pf, p.old_loan_amount, p.cr_score, p.stage,
             f.rfp_date, f.feasibility_score, f.approved, f.rejected
      from v_proposals p
      left join fprc f on f.proposal_id = p.proposal_id
      where p.stage in ('Prospect','FPRC')
      order by p.prospect_date asc nulls last limit 200`);
  }

  return NextResponse.json(await sql`
    select * from v_fprc order by rfp_date desc nulls last limit 200`);
}

/** Create or update one feasibility record, and move the proposal's stage. */
export async function PUT(req: NextRequest) {
  const b = await req.json();
  if (!b.proposal_id) {
    return NextResponse.json({ error: 'Choose a proposal first.' }, { status: 400 });
  }
  if (b.approved && b.rejected) {
    return NextResponse.json({ error: 'A proposal cannot be both approved and rejected.' }, { status: 400 });
  }
  if (b.approved && !b.approved_date) {
    return NextResponse.json({ error: 'An approved proposal needs an approved date.' }, { status: 400 });
  }

  const num = (v: unknown) => (v === '' || v === null || v === undefined ? null : Number(v));

  try {
    await sql`
      insert into fprc (proposal_id, rfp_date, cr_score, regularity_score, performance_score,
        risk_score, feasibility_score, fs_score_pct, previous_loan_amount, ai_remarks,
        active_rating, approved, approved_date, feasibility_date, rejected, comments, remarks)
      values (${b.proposal_id}, ${b.rfp_date || null}, ${num(b.cr_score)},
        ${num(b.regularity_score)}, ${num(b.performance_score)}, ${num(b.risk_score)},
        ${num(b.feasibility_score)}, ${num(b.fs_score_pct)}, ${num(b.previous_loan_amount)},
        ${b.ai_remarks || null}, ${b.active_rating || null}, ${b.approved ?? false},
        ${b.approved_date || null}, ${b.feasibility_date || null}, ${b.rejected ?? false},
        ${b.comments || null}, ${b.remarks || null})
      on conflict (proposal_id) do update set
        rfp_date = excluded.rfp_date, cr_score = excluded.cr_score,
        regularity_score = excluded.regularity_score,
        performance_score = excluded.performance_score, risk_score = excluded.risk_score,
        feasibility_score = excluded.feasibility_score, fs_score_pct = excluded.fs_score_pct,
        previous_loan_amount = excluded.previous_loan_amount,
        ai_remarks = excluded.ai_remarks, active_rating = excluded.active_rating,
        approved = excluded.approved, approved_date = excluded.approved_date,
        feasibility_date = excluded.feasibility_date, rejected = excluded.rejected,
        comments = excluded.comments, remarks = excluded.remarks, updated_at = now()`;

    const stage = b.approved ? 'Approved' : b.rejected ? 'Rejected' : 'FPRC';
    await sql`update proposals set stage = ${stage}, updated_at = now()
              where proposal_id = ${b.proposal_id}`;

    const [row] = await sql`select * from v_fprc where prospect_id = ${b.proposal_id}`;
    return NextResponse.json({ ...row, stage });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
