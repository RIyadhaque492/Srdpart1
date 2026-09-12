import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Queue sizes for the sidebar badges — what is waiting on someone. */
export async function GET() {
  const [c] = await sql`
    select
      (select count(*) from members)                                        as members,
      (select count(*) from proposals where stage = 'FPRC')                  as feasibility,
      (select count(*) from proposals p join fprc f
         on f.proposal_id = p.proposal_id and f.approved
       where p.stage = 'Approved')                                          as committee
  ` as any[];
  return NextResponse.json(c);
}
