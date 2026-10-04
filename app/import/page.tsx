'use client';

import { useState, useRef, useCallback } from 'react';
import { stageSheet, orderSheets, type ParsedSheet } from '@/lib/parse';
import { detectTarget } from '@/lib/columns';

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

interface Err { row: number; problem: string }
interface Line {
  sheet: string; target: string; label: string; total: number; sent: number; ok: number;
  failed: number; errors: Err[]; notes: string[]; done: boolean; use: boolean;
}

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [staged, setStaged] = useState<ParsedSheet[]>([]);
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  const post = useCallback(async (target: string, rows: unknown[], attempt = 0):
    Promise<{ ok: number; errors: Err[]; notes?: string[] }> => {
    try {
      const res = await fetch('/api/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
        return post(target, rows, attempt + 1);
      }
      throw e;
    }
  }, []);

  /** Step 1: read the file and show what was found. Nothing is written yet. */
  async function readFile(file: File) {
    setBusy(true); setError(null); setLines([]); setStaged([]); setFileName(file.name);
    try {
      setStatus('Reading the file…');
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });

      setStatus('Checking the rows…');
      // only convert sheets that map to a table — the workbook has large ones that don't
      const parsed = wb.SheetNames.filter((n) => detectTarget(n)).map((name) => {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
          header: 1, blankrows: false, defval: null, raw: false,
        });
        return stageSheet(name, grid);
      });
      const ordered = orderSheets(parsed);
      setStaged(ordered);
      setLines(ordered.map((p) => ({
        sheet: p.sheet, target: p.target ?? '', label: p.label ?? p.sheet,
        total: p.rows.length, sent: 0, ok: 0, failed: p.errors.length, errors: p.errors,
        notes: p.skipped ? [p.skipped] : [], done: false,
        use: !p.skipped && p.rows.length > 0 && p.target !== 'members' && p.target !== 'proposals'
              && p.target !== 'fprc' && p.target !== 'lmc',
      })));
      setStatus(ordered.length ? 'Choose what to import, then press Import.' : 'No sheets matched a table.');
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  /** Step 2: write the chosen sheets, parents before children. */
  async function run() {
    setBusy(true); setError(null); cancelled.current = false;
    try {
      for (const p of staged) {
        const line = lines.find((l) => l.sheet === p.sheet);
        if (!line?.use || line.done) continue;
        let sent = 0;
        for (const slice of splitBySize(p.rows)) {
          if (cancelled.current) break;
          setStatus(`${line.label}: ${sent + 1}–${sent + slice.length} of ${p.rows.length}`);
          sent += slice.length;
          try {
            const res = await post(p.target!, slice);
            setLines((prev) => prev.map((l) => l.sheet !== p.sheet ? l : {
              ...l, sent: l.sent + slice.length, ok: l.ok + res.ok,
              failed: l.failed + res.errors.length,
              errors: [...l.errors, ...res.errors].slice(0, 50),
              notes: Array.from(new Set([...l.notes, ...(res.notes ?? [])])),
            }));
          } catch (e) {
            setLines((prev) => prev.map((l) => l.sheet !== p.sheet ? l : {
              ...l, sent: l.sent + slice.length, failed: l.failed + slice.length,
              errors: [...l.errors, { row: (slice[0] as { excelRow: number }).excelRow,
                problem: `Batch failed: ${(e as Error).message}` }].slice(0, 50),
            }));
          }
        }
        if (cancelled.current) break;
        setLines((prev) => prev.map((l) => l.sheet === p.sheet ? { ...l, done: true } : l));
        await fetch('/api/import', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: p.target, filename: fileName,
            finalise: { total: p.rows.length, ok: 0, failed: 0 } }),
        }).catch(() => undefined);
      }
      setStatus(cancelled.current ? 'Stopped. Choose the file again to carry on — rows already saved are not duplicated.' : 'Finished.');
    } finally { setBusy(false); }
  }

  const chosen = lines.filter((l) => l.use);
  const total = chosen.reduce((a, l) => a + l.total, 0);
  const sent = chosen.reduce((a, l) => a + l.sent, 0);
  const pct = total ? Math.round((sent / total) * 100) : 0;
  const hasLoans = lines.some((l) => l.use && l.target === 'portfolios');
  const hasColl = lines.some((l) => l.use && l.target === 'collections');

  return (
    <>
      <h2>Import from Excel</h2>
      <p className="note">
        Load the Portfolio and Collections sheets from the workbook. Sheets are written in the right
        order — members, portfolios, then collections — and uploading the same file again does not
        create duplicates. Members and proposals have their own import on their own pages, so they
        start unticked here.
      </p>

      {error && <div className="msg">{error}</div>}

      <div className={`drop${over ? ' over' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setOver(true); }}
           onDragLeave={() => setOver(false)}
           onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) readFile(f); }}>
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls"
               onChange={(e) => { const f = e.target.files?.[0]; if (f) readFile(f); e.target.value = ''; }} />
        <p style={{ marginTop: 0 }}>{fileName || 'Drop the workbook here, or'}</p>
        <button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Working…' : fileName ? 'Choose another file' : 'Choose a file'}
        </button>
      </div>

      {status && <p className="note" aria-live="polite">{status}</p>}

      {lines.length > 0 && (
        <>
          <div className="scroller">
            <table>
              <thead><tr><th style={{ width: 40 }} /><th>Sheet</th><th>Goes into</th>
                <th className="num">Rows</th><th className="num">Saved</th><th className="num">Problems</th></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.sheet}>
                    <td><input type="checkbox" checked={l.use} disabled={busy || l.total === 0}
                               aria-label={`Import ${l.sheet}`}
                               onChange={(e) => setLines((prev) => prev.map((x) => x.sheet === l.sheet ? { ...x, use: e.target.checked } : x))} /></td>
                    <td>{l.sheet}</td><td>{l.label}</td>
                    <td className="num">{l.total.toLocaleString('en-IN')}</td>
                    <td className="num">{l.ok.toLocaleString('en-IN')}</td>
                    <td className="num">{l.failed.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasColl && !hasLoans && (
            <p className="note">Collections only attach to portfolios already on file; any that are missing are listed below and skipped.</p>
          )}

          <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
            <button onClick={run} disabled={busy || chosen.length === 0}>{busy ? 'Importing…' : 'Import'}</button>
            {busy && sent > 0 && <button className="quiet" onClick={() => { cancelled.current = true; }}>Stop</button>}
          </div>

          {sent > 0 && (
            <div className="bar" aria-label={`${pct}% sent`}><div style={{ width: `${pct}%` }} /></div>
          )}

          {lines.filter((l) => l.notes.length || l.errors.length).map((l) => (
            <div key={l.sheet} className={`msg${l.errors.length ? '' : ' ok'}`}>
              <strong>{l.sheet}</strong>
              <ul>
                {l.notes.map((n) => <li key={n}>{n}</li>)}
                {l.errors.slice(0, 8).map((e, i) => <li key={i}>Row {e.row}: {e.problem}</li>)}
                {l.errors.length > 8 && <li>…and {l.failed - 8 > 0 ? l.failed - 8 : l.errors.length - 8} more</li>}
              </ul>
            </div>
          ))}
        </>
      )}
    </>
  );
}
