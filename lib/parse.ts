import { TARGETS, detectTarget, norm, type Target } from './columns';
import { coerce, splitBilingual } from './calc';

/**
 * Parsing that runs in the browser. Deliberately free of Node imports so the
 * same code works on both sides — hashing and database access stay on the
 * server, where they belong.
 */

export interface StagedRow { excelRow: number; values: Record<string, unknown> }

export interface ParsedSheet {
  sheet: string;
  target: string | null;
  label?: string;
  rows: StagedRow[];
  columns: string[];
  errors: { row: number; problem: string }[];
  skipped?: string;
}

/** Sheets put headers on row 1, 2 or 3. Score the first few and pick the best. */
export function findHeaderRow(grid: unknown[][], target: Target, scanDepth = 6) {
  const known = new Set(target.fields.flatMap((f) => f.headers.map(norm)));
  let best = { index: 0, hits: -1 };
  for (let i = 0; i < Math.min(scanDepth, grid.length); i++) {
    const hits = (grid[i] || []).filter((c) => known.has(norm(c))).length;
    if (hits > best.hits) best = { index: i, hits };
  }
  return best;
}

function buildColumnIndex(headerRow: unknown[], target: Target) {
  const map = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const n = norm(cell);
    if (!n) return;
    for (const f of target.fields) {
      if (!map.has(f.col) && f.headers.some((h) => norm(h) === n)) map.set(f.col, i);
    }
  });
  return map;
}

/**
 * Pull the code off the front of "0204-জিইসি". Cells holding a placeholder
 * such as "- / -" leave nothing before the first dash; those become null
 * rather than an empty string, which would fail the foreign key.
 */
const codeOf = (v: unknown): string | null => {
  const k = String(v).split('-')[0].trim();
  return k === '' ? null : k;
};

/**
 * Values the database constrains to a fixed set. A stray entry — a religion
 * typed into the Gender column, say — is dropped rather than allowed to
 * reject the whole member, since these fields are optional and the name and
 * contact matter far more.
 */
const GENDERS = new Set(['Male', 'Female', 'Other']);
const DAYS = new Set(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

const oneOf = (v: unknown, allowed: Set<string>): string | null => {
  const s = String(v).trim();
  if (allowed.has(s)) return s;
  const titled = s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return allowed.has(titled) ? titled : null;
};

/** Excel stores zone 0102 as the number 102. Put the leading zeros back. */
const pad4 = (v: unknown): string | null => {
  const k = codeOf(v);
  if (k === null) return null;
  return /^\d+$/.test(k) ? k.padStart(4, '0') : k;
};

/**
 * Bangladeshi mobile numbers are 11 digits beginning 01. Excel treats them as
 * numbers and drops the leading zero, so 01819313681 arrives as 1819313681.
 * Put it back; leave anything that isn't that exact shape untouched so odd
 * entries stay visible rather than being silently mangled.
 */
const phone = (v: unknown) => {
  const digits = String(v).replace(/\D/g, '');
  if (/^1[3-9]\d{8}$/.test(digits)) return '0' + digits;
  if (/^01[3-9]\d{8}$/.test(digits)) return digits;
  if (/^8801[3-9]\d{8}$/.test(digits)) return digits.slice(2);
  return String(v).trim();
};

/** Turn one sheet's grid into validated rows, ready to POST. */
export function stageSheet(sheetName: string, grid: unknown[][]): ParsedSheet {
  const targetKey = detectTarget(sheetName);
  if (!targetKey) {
    return { sheet: sheetName, target: null, rows: [], columns: [], errors: [], skipped: 'No matching table' };
  }

  const target = TARGETS[targetKey];
  const header = findHeaderRow(grid, target);
  if (header.hits < 1) {
    return { sheet: sheetName, target: targetKey, label: target.label, rows: [], columns: [], errors: [], skipped: 'No recognisable header row' };
  }

  const index = buildColumnIndex(grid[header.index], target);
  const body = grid.slice(header.index + 1);
  const errors: ParsedSheet['errors'] = [];
  const staged: StagedRow[] = [];
  const seenCols = new Set<string>();

  for (let r = 0; r < body.length; r++) {
    const excelRow = header.index + r + 2;
    const row = body[r] || [];
    if (row.every((c) => c === null || c === '')) continue;

    const values: Record<string, unknown> = {};
    let bad: string | null = null;

    for (const f of target.fields) {
      const i = index.get(f.col);
      const v = i === undefined ? null : coerce(row[i], f.kind);
      if (f.required && (v === null || v === '')) { bad = `${f.headers[0]} is required`; break; }
      if (v !== null) values[f.col] = v;
    }
    if (bad) { errors.push({ row: excelRow, problem: bad }); continue; }

    if (targetKey === 'members') {
      if (values.business_name) {
        const { bn, en } = splitBilingual(values.business_name as string);
        values.business_name_bn ??= bn;
        values.business_name_en ??= en;
      }
      if (values.gender) {
        const g = oneOf(values.gender, GENDERS);
        if (g) values.gender = g; else delete values.gender;
      }
      if (values.off_day) {
        const d = oneOf(values.off_day, DAYS);
        if (d) values.off_day = d; else delete values.off_day;
      }
      if (values.primary_contact) values.primary_contact = phone(values.primary_contact);
      if (values.spouse_contact) values.spouse_contact = phone(values.spouse_contact);
      // a null here means the cell was a placeholder; drop the key entirely
      // so the column stays empty instead of holding an unmatched value
      if (values.zone_id) {
        const z = pad4(values.zone_id);
        if (z) values.zone_id = z; else delete values.zone_id;
      }
      if (values.category_code) {
        const c = codeOf(values.category_code);
        if (c) values.category_code = c; else delete values.category_code;
      }
      if (values.business_type_code) {
        const b = codeOf(values.business_type_code);
        if (b) values.business_type_code = b; else delete values.business_type_code;
      }
    }
    if (targetKey === 'proposals') {
      for (const k of ['cro_id', 'incharge_id'] as const) {
        if (!values[k]) continue;
        const c = codeOf(values[k]);
        if (c) values[k] = c; else delete values[k];
      }
    }

    Object.keys(values).forEach((c) => seenCols.add(c));
    staged.push({ excelRow, values });
  }

  // Keep the last occurrence of a repeated key: Postgres rejects a statement
  // that hits the same conflict target twice.
  const byKey = new Map<string, StagedRow>();
  for (const s of staged) byKey.set(String(s.values[target.key] ?? `~${s.excelRow}`), s);

  return {
    sheet: sheetName,
    target: targetKey,
    label: target.label,
    rows: Array.from(byKey.values()),
    columns: Array.from(seenCols),
    errors,
  };
}

/** Sheets must load parents before children or the foreign keys reject them. */
export const LOAD_ORDER = ['members', 'portfolios', 'proposals', 'fprc', 'lmc', 'collections'];

export function orderSheets(sheets: ParsedSheet[]) {
  return [...sheets].sort(
    (a, b) => LOAD_ORDER.indexOf(a.target ?? '') - LOAD_ORDER.indexOf(b.target ?? ''),
  );
}
