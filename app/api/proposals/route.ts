import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const rows = q
    ? await sql`select * from v_proposals
                where customer_name ilike ${'%' + q + '%'}
                   or proposal_id ilike ${'%' + q + '%'}
                   or profile_id ilike ${'%' + q + '%'}
                order by prospect_date desc nulls last, proposal_id desc limit 100`
    : await sql`select * from v_proposals
                order by prospect_date desc nulls last, proposal_id desc limit 100`;
  return NextResponse.json(rows);
}

/** ProposalID is YR + Month + serial, per the SRD: 26 02 1 -> "26021". */
async function nextProposalId(when: Date) {
  const prefix = String(when.getFullYear()).slice(2) + String(when.getMonth() + 1).padStart(2, '0');
  const [row] = await sql`
    select coalesce(max(substring(proposal_id from ${prefix.length + 1})::int), 0) + 1 as serial
    from proposals
    where proposal_id like ${prefix + '%'}
      and substring(proposal_id from ${prefix.length + 1}) ~ '^[0-9]+$'` as { serial: number }[];
  return `${prefix}${row.serial}`;
}

/** Mark a proposal for feasibility review. Until this happens it sits in the
 *  proposal list only — nothing reaches the review queue by itself. */
export async function PATCH(req: NextRequest) {
  const b = await req.json();
  const ids: string[] = Array.isArray(b.proposal_ids) ? b.proposal_ids : [];
  if (!ids.length) {
    return NextResponse.json({ error: 'Choose at least one proposal.' }, { status: 400 });
  }

  const blocked = await sql`
    select proposal_id, stage from proposals
    where proposal_id = any(${ids}) and stage <> 'Prospect'` as { proposal_id: string; stage: string }[];
  if (blocked.length) {
    return NextResponse.json({
      error: `Already past this step: ${blocked.map((x) => `${x.proposal_id} (${x.stage})`).join(', ')}`,
    }, { status: 409 });
  }

  await sql`update proposals set stage = 'FPRC', updated_at = now()
            where proposal_id = any(${ids}) and stage = 'Prospect'`;
  return NextResponse.json({ sent: ids.length });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const problems: string[] = [];

  if (!b.profile_id) problems.push('Choose a member.');
  const amount = Number(b.proposed_loan_amount);
  if (!amount || amount <= 0) problems.push('Proposed amount must be greater than zero.');
  const months = Number(b.proposed_duration_months);
  if (!months || months < 1 || months > 24) problems.push('Duration must be between 1 and 24 months.');
  if (!b.prospect_date) problems.push('Prospect date is required.');
  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

  // An open proposal already in flight is almost always a double entry.
  const open = await sql`
    select proposal_id, stage from proposals
    where profile_id = ${b.profile_id}
      and stage in ('Prospect','FPRC','Approved')
    limit 3` as { proposal_id: string; stage: string }[];
  if (open.length && !b.allow_duplicate) {
    return NextResponse.json({
      error: 'This member already has a proposal in progress.',
      open,
    }, { status: 409 });
  }

  const when = new Date(b.prospect_date);
  const id = await nextProposalId(when);

  try {
    await sql`
      insert into proposals (proposal_id, profile_id, old_mcl, prospect_date,
        proposed_loan_amount, proposed_duration_months, cr_score,
        cro_id, incharge_id, stage)
      values (${id}, ${b.profile_id}, ${b.old_mcl || 'New'}, ${b.prospect_date},
        ${amount}, ${months}, ${b.cr_score || null},
        ${b.cro_id || null}, ${b.incharge_id || null}, 'Prospect')`;
    const [row] = await sql`select * from v_proposals where proposal_id = ${id}`;
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('proposals_pkey')) {
      return NextResponse.json({ error: 'That Proposal ID was just taken. Try again.' }, { status: 409 });
    }
    if (msg.includes('profile_id_fkey')) {
      return NextResponse.json({ error: 'That member is not on file.' }, { status: 400 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
