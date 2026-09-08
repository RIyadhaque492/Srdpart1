'use client';

import { useState, useRef, useCallback } from 'react';
import { stageSheet, orderSheets, type ParsedSheet } from '@/lib/parse';

/** Target bytes per request. Rows vary hugely in width — a member row with
 *  Bangla addresses is ~1.5 KB, a collection row ~360 B — so batch by payload
 *  size, not row count, and every request stays the same size on the wire. */
const TARGET_BYTES = 60 * 1024;
const MAX_ROWS = 500;

function splitBySize<T>(rows: T[]): T[][] {
  if (!rows.length) return [];
  const perRow = new Blob([JSON.stringify(rows)]).size / rows.length;
  const size = Math.max(1, Math.min(MAX_ROWS, Math.floor(TARGET_BYTES / perRow)));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

interface SheetProgress {
  sheet: string;
  label: string;
  total: number;
  sent: number;
  ok: number;
  failed: number;
  errors: { row: number; problem: string }[];
  skipped?: string;
  done: boolean;
}

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SheetProgress[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  /** POST one batch, retrying twice — a dropped request on a weak signal
   *  shouldn't lose 300 rows of work. */
  const postBatch = useCallback(async (target: string, rows: unknown[], attempt = 0): Promise<{ ok: number; errors: { row: number; problem: string }[] }> => {
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, rows }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Server returned ${res.status}`;
        try { msg = JSON.parse(text).error ?? msg; } catch { /* HTML error page */ }
        throw new Error(msg);
      }
      return await res.json();
    } catch (e) {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        return postBatch(target, rows, attempt + 1);
      }
      throw e;
    }
  }, []);

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    setProgress([]);
    cancelled.current = false;

    try {
      setStatus('Reading the file…');
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: true });

      setStatus('Checking the rows…');
      const parsed: ParsedSheet[] = wb.SheetNames.map((name) => {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
          header: 1, blankrows: false, defval: null, raw: false,
        });
        return stageSheet(name, grid);
      });

      // Step one is the member register only. Other sheets are recognised but
      // left alone, so a full workbook can be uploaded without surprises.
      const ordered = orderSheets(parsed).map((p) =>
        p.target && p.target !== 'members'
          ? { ...p, rows: [], errors: [], skipped: 'Not part of step one — members only for now' }
          : p,
      );
      setProgress(ordered.map((p) => ({
        sheet: p.sheet,
        label: p.label ?? '—',
        total: p.rows.length,
        sent: 0,
        ok: 0,
        failed: p.errors.length,
        errors: p.errors,
        skipped: p.skipped,
        done: !!p.skipped || p.rows.length === 0,
      })));

      for (const sheet of ordered) {
        if (cancelled.current) break;
        if (!sheet.target || !sheet.rows.length) continue;

        const batches = splitBySize(sheet.rows);
        let done = 0;

        for (const slice of batches) {
          if (cancelled.current) break;
          setStatus(`${sheet.label}: ${done + 1}–${done + slice.length} of ${sheet.rows.length}`);
          done += slice.length;

          try {
            const res = await postBatch(sheet.target, slice);
            setProgress((prev) => prev.map((p) => p.sheet !== sheet.sheet ? p : {
              ...p,
              sent: p.sent + slice.length,
              ok: p.ok + res.ok,
              failed: p.failed + res.errors.length,
              errors: [...p.errors, ...res.errors].slice(0, 50),
              done: p.sent + slice.length >= p.total,
            }));
          } catch (e) {
            setProgress((prev) => prev.map((p) => p.sheet !== sheet.sheet ? p : {
              ...p,
              sent: p.sent + slice.length,
              failed: p.failed + slice.length,
              errors: [...p.errors, { row: slice[0].excelRow, problem: `Batch failed: ${(e as Error).message}` }].slice(0, 50),
              done: p.sent + slice.length >= p.total,
            }));
          }
        }
      }

      setStatus(cancelled.current ? 'Stopped. Re-upload the same file to carry on — finished rows are updated, not duplicated.' : 'Finished.');
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const totalRows = progress.reduce((a, p) => a + p.total, 0);
  const sentRows = progress.reduce((a, p) => a + p.sent, 0);
  const pct = totalRows ? Math.round((sentRows / totalRows) * 100) : 0;

  return (
    <>
      <h2>Upload members</h2>
      <p className="note">
        Only the <code>1.DB_Member</code> sheet is imported at this stage. Other
        sheets in the file are listed and skipped. The file is read on this device
        and sent in small batches, so a large workbook or a slow connection is
        fine, and members that already exist are updated rather than duplicated —
        it is always safe to upload the same file again.
      </p>

      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f && !busy) handleFile(f);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.csv"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        <p style={{ marginTop: 0 }}>Drop an .xlsx file here, or</p>
        <button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Working…' : 'Choose a file'}
        </button>
        {busy && (
          <button className="quiet" style={{ marginLeft: 10 }}
                  onClick={() => { cancelled.current = true; }}>
            Stop
          </button>
        )}
        <p className="note" style={{ margin: '14px auto 0' }}>
          <a href="/api/template">Download a blank template</a> with the exact headers.
        </p>
      </div>

      {busy && totalRows > 0 && (
        <>
          <div style={{ height: 6, background: 'var(--rule)', marginTop: 20 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width .2s' }} />
          </div>
          <p className="note" style={{ marginTop: 8 }}>{pct}% — {status}</p>
        </>
      )}
      {!busy && status && <div className="msg ok">{status}</div>}
      {error && <div className="msg">{error}</div>}

      {progress.length > 0 && (
        <>
          <h2>Progress</h2>
          <table>
            <thead>
              <tr>
                <th>Sheet</th><th>Goes to</th>
                <th className="num">Rows</th><th className="num">Imported</th>
                <th className="num">Failed</th><th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {progress.map((p) => (
                <tr key={p.sheet}>
                  <td>{p.sheet}</td>
                  <td>{p.label}</td>
                  <td className="num">{p.total}</td>
                  <td className="num">{p.ok}</td>
                  <td className="num">{p.failed}</td>
                  <td>
                    {p.skipped ? p.skipped
                      : !p.done ? `${Math.round((p.sent / Math.max(p.total, 1)) * 100)}%`
                      : p.errors.length ? `Row ${p.errors[0].row}: ${p.errors[0].problem.slice(0, 60)}`
                      : 'Clean'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {progress.some((p) => p.errors.length > 0) && (
            <>
              <h2>Rows that need fixing</h2>
              <table>
                <thead><tr><th>Sheet</th><th className="num">Excel row</th><th>Problem</th></tr></thead>
                <tbody>
                  {progress.flatMap((p) =>
                    p.errors.map((e, i) => (
                      <tr key={`${p.sheet}-${i}`}>
                        <td>{p.sheet}</td>
                        <td className="num">{e.row}</td>
                        <td>{e.problem}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
              <p className="note">
                Fix these in the spreadsheet and upload it again. Rows that already
                landed will be updated in place.
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
