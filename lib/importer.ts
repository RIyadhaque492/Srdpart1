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
 * Write one batch. If it fails, retry row by row so a single bad row is
 * reported by its Excel row number instead of taking the batch down with it.
 */
export async function writeBatch(targetKey: string, rows: StagedRow[]) {
  const target = TARGETS[targetKey];
  if (!target) throw new Error(`Unknown target: ${targetKey}`);
  if (!rows.length) return { ok: 0, errors: [] as RowError[] };

  // collections have no natural key; hash the content so re-uploads dedupe
  if (targetKey === 'collections') {
    for (const r of rows) r.values.source_hash = rowHash(targetKey, r.values);
  }

  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r.values))));
  const errors: RowError[] = [];
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

  return { ok, errors };
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
