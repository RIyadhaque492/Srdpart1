import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { sql } from '@/lib/db';
import { CASH_TYPES, isCash } from '@/lib/collections';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (error: string, status = 400, extra: object = {}) =>
  NextResponse.json({ error, ...extra }, { status });

/** GET ?q=&from=&to=  — newest first, with the cash total for the same filter. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const q = (p.get('q') ?? '').trim();
  const from = p.get('from') ?? '';
  const to = p.get('to') ?? '';

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    params.push('%' + q + '%');
    where.push(`(c.portfolio_no ilike $${params.length} or m.member_name ilike $${params.length})`);
  }
  if (DATE.test(from)) { params.push(from); where.push(`c.transaction_date >= $${params.length}`); }
  if (DATE.test(to))   { params.push(to);   where.push(`c.transaction_date <= $${params.length}`); }
  const w = where.length ? 'where ' + where.join(' and ') : '';
  const from_ = `from collections c
                 left join portfolios pf on pf.portfolio_no = c.portfolio_no
                 left join members m on m.profile_id = pf.profile_id ${w}`;

  const cashIdx = params.length + 1;
  const [rows, sum] = await Promise.all([
    sql.query(
      `select c.id, c.portfolio_no, m.member_name, c.transaction_date, c.amount,
              c.particulars, c.installment, c.entry_by, c.remarks, c.checked, c.audited,
              (c.source_hash like 'app:%') as app_entry
       ${from_} order by c.transaction_date desc nulls last, c.id desc limit 200`, params),
    sql.query(
      `select count(*) as n,
              coalesce(sum(c.amount) filter (where c.particulars = any($${cashIdx})), 0) as cash
       ${from_}`, [...params, [...CASH_TYPES]]),
  ]);
  return NextResponse.json({ rows, summary: (sum as any[])[0] });
}

/** Record one cash collection and move the portfolio's totals in the same transaction. */
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b) return bad('Could not read the request.');

  const no = String(b.portfolio_no ?? '').trim();
  const amount = Number(b.amount);
  const particulars = String(b.particulars || 'Regular Collection');
  const today = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10); // 1 day grace for time zones
  const date = String(b.transaction_date ?? '');
  const by = String(b.entry_by ?? '').trim() || 'App';

  if (!no) return bad('Choose a portfolio first.');
  if (!Number.isFinite(amount) || amount <= 0) return bad('Amount must be more than zero.');
  if (amount > 100_000_000) return bad('That amount looks too large. Check it and try again.');
  if (!isCash(particulars)) return bad('Choose a collection type.');
  if (!DATE.test(date)) return bad('Enter the transaction date.');
  if (date > today) return bad('The transaction date cannot be in the future.');

  const [pf] = await sql`
    select portfolio_no, status, outstandings, instl_amount, disbursed_date, area_code
    from portfolios where portfolio_no = ${no}` as any[];
  if (!pf) return bad(`Portfolio ${no} is not on file.`, 404);
  if (pf.status === 'Loan Finished') return bad('This loan is already finished.');
  if (pf.disbursed_date && date < String(pf.disbursed_date).slice(0, 10)) {
    return bad('The transaction date is before the loan was disbursed.');
  }

  const out = Number(pf.outstandings ?? 0);
  if (amount > out && !b.allow_excess) {
    return bad(`This is more than the outstanding ৳${out.toLocaleString('en-IN')}.`, 409,
      { needs_confirm: true, outstandings: out });
  }

  // Same collection entered twice within a minute is almost always a double tap.
  const dupe = await sql`
    select 1 from collections
    where portfolio_no = ${no} and transaction_date = ${date}::date and amount = ${amount}
      and particulars = ${particulars} and entry_date > now() - interval '60 seconds'`;
  if (dupe.length) return bad('The same collection was just recorded. Refresh to see it.', 409);

  try {
    const done = await sql.transaction([
      sql`insert into collections (portfolio_no, entry_date, transaction_date, amount, entry_by,
            area_code, remarks, old_new, particulars, installment, status, source_hash)
          values (${no}, now(), ${date}::date, ${amount}, ${by}, ${pf.area_code},
            ${String(b.remarks ?? '').trim() || null}, 'New', ${particulars},
            ${pf.instl_amount}, ${pf.status}, ${'app:' + randomUUID()})
          returning id`,
      sql`update portfolios set
            total_collected = coalesce(total_collected, 0) + ${amount},
            outstandings = greatest(coalesce(outstandings, 0) - ${amount}, 0),
            status = case when greatest(coalesce(outstandings, 0) - ${amount}, 0) = 0
                          then 'Loan Finished' else status end,
            finished_date = case when greatest(coalesce(outstandings, 0) - ${amount}, 0) = 0
                                 then ${date}::date else finished_date end
          where portfolio_no = ${no}
          returning outstandings, status`,
    ]) as any[][];
    return NextResponse.json({ id: done[0][0].id, ...done[1][0] });
  } catch (e) {
    return bad((e as Error).message);
  }
}

/** Tick-off steps: {ids, action: 'check' | 'audit'}. Audit needs the check first. */
export async function PATCH(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const ids: number[] = Array.isArray(b?.ids) ? b.ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return bad('Choose at least one collection.');

  if (b.action === 'check') {
    const r = await sql`update collections set checked = true, checked_time = now()
                        where id = any(${ids}::bigint[]) and not coalesce(checked, false)
                        returning id`;
    return NextResponse.json({ updated: r.length });
  }
  if (b.action === 'audit') {
    const r = await sql`update collections set audited = true, audited_time = now()
                        where id = any(${ids}::bigint[]) and checked and not coalesce(audited, false)
                        returning id`;
    return NextResponse.json({ updated: r.length, skipped: ids.length - r.length });
  }
  return bad('Unknown action.');
}

/**
 * Reverse a collection entered in the app. Imported history is not deletable:
 * the portfolio totals loaded from the workbook were not built from those rows,
 * so reversing one would push the totals out of step. Audited rows are locked.
 */
export async function DELETE(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id)) return bad('Missing collection id.');

  const [c] = await sql`select id, portfolio_no, amount, particulars, transaction_date, audited, source_hash
                        from collections where id = ${id}` as any[];
  if (!c) return bad('Collection not found.', 404);
  if (!String(c.source_hash ?? '').startsWith('app:')) {
    return bad('Only collections entered in this app can be reversed.');
  }
  if (c.audited) return bad('Audited collections are locked.');

  try {
    await sql.transaction([
      sql`delete from collections where id = ${id}`,
      sql`update portfolios set
            total_collected = greatest(coalesce(total_collected, 0) - ${c.amount}, 0),
            outstandings = coalesce(outstandings, 0) + ${c.amount},
            status = case when status = 'Loan Finished' and finished_date = ${c.transaction_date}::date
                          then 'Running' else status end,
            finished_date = case when status = 'Loan Finished' and finished_date = ${c.transaction_date}::date
                                 then null else finished_date end
          where portfolio_no = ${c.portfolio_no}`,
    ]);
    return NextResponse.json({ reversed: id });
  } catch (e) {
    return bad((e as Error).message);
  }
}
