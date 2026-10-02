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

/**
 * ProposalID is YR + Month + serial, per the SRD: 26 09 1 -> "26091".
 *
 * The serial is worked out inside the INSERT itself rather than by a separate
 * SELECT, so the number cannot go stale between reading it and using it.
 *
 * Note `substr(proposal_id, $n::int)`, not `substring(... from $n)`. With a
 * bare parameter Postgres reads the second argument as a regular expression
 * instead of a position, so the count silently came back as zero every time
 * and the same ID was handed out over and over.
 */
const PREFIX_LEN = 4;                       // YY + MM

function monthPrefix(when: Date) {
  return String(when.getFullYear()).slice(2) + String(when.getMonth() + 1).padStart(2, '0');
}

async function insertProposal(prefix: string, b: Record<string, unknown>,
                              amount: number, months: number) {
  const [row] = await sql`
    insert into proposals (proposal_id, profile_id, old_mcl, prospect_date,
      proposed_loan_amount, proposed_duration_months, cr_score,
      cro_id, incharge_id, stage)
    select
      ${prefix} || (coalesce(max(substr(proposal_id, ${PREFIX_LEN + 1}::int)::bigint), 0) + 1)::text,
      ${b.profile_id as string}, ${(b.old_mcl as string) || 'New'}, ${b.prospect_date as string},
      ${amount}, ${months}, ${(b.cr_score as string) || null},
      ${(b.cro_id as string) || null}, ${(b.incharge_id as string) || null}, 'Prospect'
    from proposals
    where proposal_id like ${prefix + '%'}
      and substr(proposal_id, ${PREFIX_LEN + 1}::int) ~ '^[0-9]+$'
    returning proposal_id` as { proposal_id: string }[];
  return row.proposal_id;
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

  const prefix = monthPrefix(new Date(b.prospect_date));

  // Two officers saving at the same instant can land on the same serial.
  // Retry rather than making a person read an error and press the button again.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const id = await insertProposal(prefix, b, amount, months);
      const [row] = await sql`select * from v_proposals where proposal_id = ${id}`;
      return NextResponse.json(row, { status: 201 });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes('proposals_pkey') && attempt < 4) continue;
      if (msg.includes('proposals_pkey')) {
        return NextResponse.json(
          { error: 'Too many proposals were saved at once. Try once more.' }, { status: 409 });
      }
      if (msg.includes('profile_id_fkey')) {
        return NextResponse.json({ error: 'That member is not on file.' }, { status: 400 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
  }
  return NextResponse.json({ error: 'Could not allocate a Proposal ID.' }, { status: 500 });
}
