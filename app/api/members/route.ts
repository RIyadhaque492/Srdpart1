import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export const runtime = 'nodejs';

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const GENDERS = ['Male', 'Female', 'Other'];

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);

  const rows = q
    ? await sql`select m.*, v.no_of_portfolios, v.last_portfolio, v.pf_status
                from members m left join v_member_portfolio v using (profile_id)
                where m.member_name ilike ${'%' + q + '%'}
                   or m.profile_id ilike ${'%' + q + '%'}
                   or m.primary_contact ilike ${'%' + q + '%'}
                   or m.nid_no ilike ${'%' + q + '%'}
                order by m.profile_id desc limit ${limit}`
    : await sql`select m.*, v.no_of_portfolios, v.last_portfolio, v.pf_status
                from members m left join v_member_portfolio v using (profile_id)
                order by m.profile_id desc limit ${limit}`;
  return NextResponse.json(rows);
}

/** Next profile ID: one above the highest numeric one on file. */
async function nextProfileId() {
  const [row] = await sql`
    select coalesce(max(profile_id::bigint), 100000) + 1 as next
    from members where profile_id ~ '^[0-9]+$'` as { next: string }[];
  return String(row.next);
}

export async function POST(req: NextRequest) {
  const b = await req.json();

  const name = String(b.member_name ?? '').trim();
  const contact = String(b.primary_contact ?? '').trim();

  const problems: string[] = [];
  if (!name) problems.push('Member name is required.');
  if (!contact) problems.push('Primary contact is required.');
  else if (!/^01[3-9]\d{8}$/.test(contact)) problems.push('Contact should be 11 digits starting 01.');
  if (b.nid_no && !/^\d{10}$|^\d{13}$|^\d{17}$/.test(String(b.nid_no).trim())) {
    problems.push('NID should be 10, 13 or 17 digits.');
  }
  if (b.gender && !GENDERS.includes(b.gender)) problems.push('Gender is not valid.');
  if (b.off_day && !DAYS.includes(b.off_day)) problems.push('Off day is not valid.');

  if (problems.length) return NextResponse.json({ error: problems.join(' ') }, { status: 400 });

  // Flag an existing member rather than creating a quiet duplicate.
  if (!b.allow_duplicate) {
    const dupes = await sql`
      select profile_id, member_name from members
      where primary_contact = ${contact}
         or (${b.nid_no ?? null}::text is not null and nid_no = ${b.nid_no ?? null})
      limit 3` as { profile_id: string; member_name: string }[];
    if (dupes.length) {
      return NextResponse.json({
        error: 'A member with this contact or NID already exists.',
        duplicates: dupes,
      }, { status: 409 });
    }
  }

  const profileId = String(b.profile_id ?? '').trim() || await nextProfileId();

  try {
    const [row] = await sql`
      insert into members (profile_id, member_name, primary_contact, nid_no, business_name,
        business_address, area_code, zone_id, category_code, business_type_code, profile_date,
        father_name, mother_name, spouse_name, spouse_contact, present_address,
        permanent_address, gender, religion, client_dob, perm_thana, off_day, old_mcl)
      values (${profileId}, ${name}, ${contact}, ${b.nid_no || null}, ${b.business_name || null},
        ${b.business_address || null}, ${b.area_code || null}, ${b.zone_id || null},
        ${b.category_code || null}, ${b.business_type_code || null}, ${b.profile_date || null},
        ${b.father_name || null}, ${b.mother_name || null}, ${b.spouse_name || null},
        ${b.spouse_contact || null}, ${b.present_address || null}, ${b.permanent_address || null},
        ${b.gender || null}, ${b.religion || null}, ${b.client_dob || null},
        ${b.perm_thana || null}, ${b.off_day || null}, ${b.old_mcl || null})
      returning profile_id, member_name`;
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('members_zone_id_fkey')) {
      return NextResponse.json({ error: 'That zone is not in the lookup list.' }, { status: 400 });
    }
    if (msg.includes('members_pkey')) {
      return NextResponse.json({ error: 'That Profile ID is already taken.' }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
