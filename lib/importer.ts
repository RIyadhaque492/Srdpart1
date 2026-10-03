import { createHash } from 'crypto';
import { TARGETS, type Target } from './columns';
import { sql } from './db';
import type { StagedRow } from './parse';

/** Rows per INSERT. Postgres caps a statement at 65535 parameters. */
const CHUNK = 500;

export interface RowError { row: number; problem: string }

function rowHash(target: string, values: Record<string, unknown>) {
  return createHash('sha1').update(target + JSON.stringify(values)).digest('hex');
}

/**
 * One INSERT for many rows. Rows don't all carry the same columns, because
 * empty cells are dropped, so the statement uses the union of columns and
 * pads gaps with null. On conflict the update coalesces — a null incoming
 * value leaves the stored one alone rather than wiping it.
 */
function buildStatement(target: Target, cols: string[], rows: StagedRow[]) {
  const params: unknown[] = [];
  const tuples = rows.map((r) => {
    const slots = cols.map((c) => {
      params.push(r.values[c] ?? null);
      return `$${params.length}`;
    });
    return `(${slots.join(', ')})`;
  });

  const updates = cols
    .filter((c) => c !== target.key)
    .map((c) => `${c} = coalesce(excluded.${c}, ${target.table}.${c})`)
    .join(', ');

  return {
    text:
      `insert into ${target.table} (${cols.join(', ')}) values ${tuples.join(', ')} ` +
      `on conflict (${target.key}) do update set ` +
      (updates || `${target.key} = excluded.${target.key}`),
    params,
  };
}


/**
 * Check references before writing, so one missing parent does not push a
 * whole batch into the slow row-by-row retry (the collections sheet has ~50,000
 * rows). Collections whose portfolio is not on file are reported and skipped.
 * Portfolios keep their row but lose a link to a member or proposal that is not
 * on file — the same thing 3-fix_ids.sql does — and say so in `notes`.
 */
async function checkReferences(targetKey: string, rows: StagedRow[]) {
  const errors: RowError[] = [];
  const notes: string[] = [];

  if (targetKey === 'collections') {
    const nos = Array.from(new Set(rows.map((r) => String(r.values.portfolio_no))));
    const found = (await sql.query(
      'select portfolio_no from portfolios where portfolio_no = any($1)', [nos],
    )) as { portfolio_no: string }[];
    const known = new Set(found.map((f) => f.portfolio_no));
    const keep = rows.filter((r) => {
      if (known.has(String(r.values.portfolio_no))) return true;
      errors.push({ row: r.excelRow, problem: `Portfolio ${r.values.portfolio_no} is not on file — import the Portfolio sheet first` });
      return false;
    });
    return { rows: keep, errors, notes };
  }

  if (targetKey === 'portfolios') {
    const ids = (k: string) =>
      Array.from(new Set(rows.map((r) => r.values[k]).filter(Boolean).map(String)));
    const [mem, prop] = await Promise.all([
      sql.query('select profile_id from members where profile_id = any($1)', [ids('profile_id')]),
      sql.query('select proposal_id from proposals where proposal_id = any($1)', [ids('proposal_id')]),
    ]) as [{ profile_id: string }[], { proposal_id: string }[]];
    const members = new Set(mem.map((m) => m.profile_id));
    const proposals = new Set(prop.map((p) => p.proposal_id));
    let unlinked = 0;
    for (const r of rows) {
      let hit = false;
      if (r.values.profile_id && !members.has(String(r.values.profile_id))) { delete r.values.profile_id; hit = true; }
      if (r.values.proposal_id && !proposals.has(String(r.values.proposal_id))) { delete r.values.proposal_id; hit = true; }
      if (hit) unlinked++;
    }
    if (unlinked) notes.push(`${unlinked} portfolio row(s) saved without a member/proposal link because that member or proposal is not on file yet.`);
  }

  return { rows, errors, notes };
}

/**
 * Write one batch. If it fails, retry row by row so a single bad row is
 * reported by its Excel row number instead of taking the batch down with it.
 */
export async function writeBatch(targetKey: string, input: StagedRow[]) {
  const target = TARGETS[targetKey];
  if (!target) throw new Error(`Unknown target: ${targetKey}`);
  if (!input.length) return { ok: 0, errors: [] as RowError[], notes: [] as string[] };

  const checked = await checkReferences(targetKey, input);
  const rows = checked.rows;
  const notes = checked.notes;
  if (!rows.length) return { ok: 0, errors: checked.errors, notes };

  // collections have no natural key; hash the content so re-uploads dedupe
  if (targetKey === 'collections') {
    for (const r of rows) r.values.source_hash = rowHash(targetKey, r.values);
  }

  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r.values))));
  const errors: RowError[] = [...checked.errors];
  let ok = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    try {
      const { text, params } = buildStatement(target, cols, slice);
      await sql.query(text, params);
      ok += slice.length;
    } catch {
      for (const r of slice) {
        try {
          const { text, params } = buildStatement(target, cols, [r]);
          await sql.query(text, params);
          ok++;
        } catch (e) {
          errors.push({ row: r.excelRow, problem: (e as Error).message.slice(0, 200) });
        }
      }
    }
  }

  return { ok, errors, notes };
}

export async function logImport(
  filename: string,
  target: string,
  totals: { total: number; ok: number; failed: number },
  errors: RowError[],
) {
  await sql`
    insert into import_batches (filename, target, rows_total, rows_ok, rows_failed, errors)
    values (${filename}, ${target}, ${totals.total}, ${totals.ok}, ${totals.failed},
            ${JSON.stringify(errors.slice(0, 200))})
  `;
}
