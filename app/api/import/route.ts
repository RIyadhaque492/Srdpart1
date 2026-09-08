import { NextRequest, NextResponse } from 'next/server';
import { writeBatch, logImport } from '@/lib/importer';
import { TARGETS } from '@/lib/columns';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Accepts one batch of already-parsed rows. The browser does the file reading
 * and validation, so each request stays small and the function never runs long
 * — which is what makes this work on a slow connection and on big workbooks.
 */
export async function POST(req: NextRequest) {
  let body: {
    target?: string;
    rows?: { excelRow: number; values: Record<string, unknown> }[];
    filename?: string;
    finalise?: { total: number; ok: number; failed: number };
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the request.' }, { status: 400 });
  }

  const { target, rows, filename, finalise } = body;

  if (!target || !TARGETS[target]) {
    return NextResponse.json({ error: `Unknown target "${target}".` }, { status: 400 });
  }

  if (finalise) {
    await logImport(filename ?? 'upload', target, finalise, []);
    return NextResponse.json({ logged: true });
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows in this batch.' }, { status: 400 });
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: 'Batch too large; send 500 rows or fewer.' }, { status: 413 });
  }

  try {
    const result = await writeBatch(target, rows);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
