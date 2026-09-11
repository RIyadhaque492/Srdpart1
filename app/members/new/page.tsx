'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { stageSheet, type ParsedSheet } from '@/lib/parse';

interface Lookups {
  areas: { code: string; name: string }[];
  zones: { id: string; name: string; area_code: string | null }[];
  categories: { code: string; name: string }[];
  types: { code: string; name: string; category_code: string | null }[];
}

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

export default function AddMembers() {
  const [tab, setTab] = useState<'one' | 'file'>('one');
  const [lk, setLk] = useState<Lookups | null>(null);

  useEffect(() => {
    fetch('/api/lookups').then((r) => r.json()).then(setLk).catch(() => setLk(null));
  }, []);

  return (
    <>
      <h2>Add members</h2>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'one'}
                className={`tab${tab === 'one' ? ' on' : ''}`}
                onClick={() => setTab('one')}>
          One at a time
        </button>
        <button role="tab" aria-selected={tab === 'file'}
                className={`tab${tab === 'file' ? ' on' : ''}`}
                onClick={() => setTab('file')}>
          From a file
        </button>
      </div>

      {tab === 'one' ? <ManualEntry lk={lk} /> : <FileUpload />}
    </>
  );
}

/* ------------------------------------------------------------ manual entry */

const EMPTY = {
  member_name: '', primary_contact: '', nid_no: '', business_name: '', business_address: '',
  area_code: '', zone_id: '', category_code: '', business_type_code: '',
  profile_date: new Date().toISOString().slice(0, 10),
  father_name: '', mother_name: '', spouse_name: '', spouse_contact: '',
  present_address: '', permanent_address: '', gender: '', religion: '',
  client_dob: '', perm_thana: '', off_day: 'Fri', old_mcl: '',
};

function ManualEntry({ lk }: { lk: Lookups | null }) {
  const [form, setForm] = useState({ ...EMPTY });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<{ profile_id: string; member_name: string }[]>([]);
  const [saved, setSaved] = useState<{ profile_id: string; member_name: string } | null>(null);

  const set = (k: string, v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'area_code') next.zone_id = '';            // clear child on parent change
      if (k === 'category_code') next.business_type_code = '';
      return next;
    });
    setDupes([]);
  };

  const zones = useMemo(
    () => (lk?.zones ?? []).filter((z) => !form.area_code || z.area_code === form.area_code),
    [lk, form.area_code],
  );
  const types = useMemo(
    () => (lk?.types ?? []).filter((t) => !form.category_code || t.category_code === form.category_code),
    [lk, form.category_code],
  );

  async function save(allowDuplicate = false) {
    setBusy(true); setError(null); setSaved(null);
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, allow_duplicate: allowDuplicate }),
      });
      const data = await res.json();
      if (res.status === 409 && data.duplicates) { setDupes(data.duplicates); setError(data.error); }
      else if (!res.ok) setError(data.error ?? 'Could not save.');
      else { setSaved(data); setForm({ ...EMPTY }); }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const F = ({ k, label, type = 'text', hint }:
             { k: keyof typeof EMPTY; label: string; type?: string; hint?: string }) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} type={type} value={form[k]}
             inputMode={type === 'tel' ? 'numeric' : undefined}
             onChange={(e) => set(k, e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <>
      <p className="note">
        The Profile ID is assigned automatically. Only the name and contact number
        are required — the rest can be filled in later.
      </p>

      {saved && (
        <div className="msg ok">
          Saved <strong>{saved.member_name}</strong> as Profile ID <strong>{saved.profile_id}</strong>.
          Ready for the next one.
        </div>
      )}
      {error && (
        <div className="msg">
          {error}
          {dupes.length > 0 && (
            <>
              <ul style={{ margin: '8px 0 8px 18px' }}>
                {dupes.map((d) => <li key={d.profile_id}>{d.profile_id} — {d.member_name}</li>)}
              </ul>
              <button className="quiet" onClick={() => save(true)} disabled={busy}>Save anyway</button>
            </>
          )}
        </div>
      )}

      <h3>Member</h3>
      <div className="grid2">
        <F k="member_name" label="Member name *" />
        <F k="primary_contact" label="Primary contact *" type="tel" hint="11 digits, e.g. 01712345678" />
        <F k="nid_no" label="NID number" hint="10, 13 or 17 digits" />
        <F k="client_dob" label="Date of birth" type="date" />
        <div className="field">
          <label htmlFor="gender">Gender</label>
          <select id="gender" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option><option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        <F k="religion" label="Religion" />
        <F k="father_name" label="Father's name" />
        <F k="mother_name" label="Mother's name" />
        <F k="spouse_name" label="Spouse name" />
        <F k="spouse_contact" label="Spouse contact" type="tel" />
      </div>

      <h3>Business</h3>
      <div className="grid2">
        <F k="business_name" label="Business name" hint="Bangla / English is split automatically" />
        <F k="business_address" label="Business address" />
        <div className="field">
          <label htmlFor="area_code">Business area</label>
          <select id="area_code" value={form.area_code} onChange={(e) => set('area_code', e.target.value)}>
            <option value="">—</option>
            {lk?.areas.map((a) => <option key={a.code} value={a.code}>{a.code}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="zone_id">
            Zone {form.area_code && <span className="hint">({zones.length} in {form.area_code})</span>}
          </label>
          <select id="zone_id" value={form.zone_id} onChange={(e) => set('zone_id', e.target.value)}>
            <option value="">{form.area_code ? '—' : 'Pick an area first'}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="category_code">Business category</label>
          <select id="category_code" value={form.category_code}
                  onChange={(e) => set('category_code', e.target.value)}>
            <option value="">—</option>
            {lk?.categories.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="business_type_code">Business type</label>
          <select id="business_type_code" value={form.business_type_code}
                  onChange={(e) => set('business_type_code', e.target.value)}>
            <option value="">{form.category_code ? '—' : 'Pick a category first'}</option>
            {types.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="off_day">Weekly off day</label>
          <select id="off_day" value={form.off_day} onChange={(e) => set('off_day', e.target.value)}>
            {DAYS.map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <F k="old_mcl" label="Old MCL" />
      </div>

      <h3>Addresses</h3>
      <div className="grid2">
        <F k="present_address" label="Present address" />
        <F k="permanent_address" label="Permanent address" />
        <F k="perm_thana" label="Permanent thana" />
        <F k="profile_date" label="Profile date" type="date" />
      </div>

      <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
        <button onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save member'}</button>
        <button className="quiet" disabled={busy}
                onClick={() => { setForm({ ...EMPTY }); setError(null); setDupes([]); setSaved(null); }}>
          Clear
        </button>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- file upload */

const TARGET_BYTES = 60 * 1024;
const MAX_ROWS = 500;

/** Batch by payload size, not row count — a member row with Bangla addresses
 *  is ~1.5 KB, so a fixed row count gives wildly uneven requests. */
function splitBySize<T>(rows: T[]): T[][] {
  if (!rows.length) return [];
  const perRow = new Blob([JSON.stringify(rows)]).size / rows.length;
  const size = Math.max(1, Math.min(MAX_ROWS, Math.floor(TARGET_BYTES / perRow)));
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

interface Sheet {
  sheet: string; total: number; sent: number; ok: number; failed: number;
  errors: { row: number; problem: string }[]; skipped?: string; done: boolean;
}

function FileUpload() {
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  /** Retry twice — a dropped request on a weak signal shouldn't lose a batch. */
  const post = useCallback(async (
    rows: unknown[], attempt = 0,
  ): Promise<{ ok: number; errors: { row: number; problem: string }[] }> => {
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'members', rows }),
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
        return post(rows, attempt + 1);
      }
      throw e;
    }
  }, []);

  async function handleFile(file: File) {
    setBusy(true); setError(null); setSheets([]); cancelled.current = false;
    try {
      setStatus('Reading the file…');
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });

      setStatus('Checking the rows…');
      const parsed: ParsedSheet[] = wb.SheetNames.map((name) => {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
          header: 1, blankrows: false, defval: null, raw: false,
        });
        const p = stageSheet(name, grid);
        return p.target && p.target !== 'members'
          ? { ...p, rows: [], errors: [], skipped: 'Not part of step one' }
          : p;
      });

      setSheets(parsed.map((p) => ({
        sheet: p.sheet, total: p.rows.length, sent: 0, ok: 0,
        failed: p.errors.length, errors: p.errors, skipped: p.skipped,
        done: !!p.skipped || p.rows.length === 0,
      })));

      const members = parsed.find((p) => p.target === 'members');
      if (!members || !members.rows.length) {
        setStatus('No member rows found. The sheet should be named 1.DB_Member.');
        return;
      }

      let done = 0;
      for (const slice of splitBySize(members.rows)) {
        if (cancelled.current) break;
        setStatus(`Members: ${done + 1}–${done + slice.length} of ${members.rows.length}`);
        done += slice.length;
        try {
          const res = await post(slice);
          setSheets((prev) => prev.map((s) => s.sheet !== members.sheet ? s : {
            ...s, sent: s.sent + slice.length, ok: s.ok + res.ok,
            failed: s.failed + res.errors.length,
            errors: [...s.errors, ...res.errors].slice(0, 50),
            done: s.sent + slice.length >= s.total,
          }));
        } catch (e) {
          setSheets((prev) => prev.map((s) => s.sheet !== members.sheet ? s : {
            ...s, sent: s.sent + slice.length, failed: s.failed + slice.length,
            errors: [...s.errors,
              { row: (slice[0] as { excelRow: number }).excelRow,
                problem: `Batch failed: ${(e as Error).message}` }].slice(0, 50),
            done: s.sent + slice.length >= s.total,
          }));
        }
      }

      setStatus(cancelled.current
        ? 'Stopped. Upload the same file again to carry on — finished rows are updated, not duplicated.'
        : 'Finished.');
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  const total = sheets.reduce((a, s) => a + s.total, 0);
  const sent = sheets.reduce((a, s) => a + s.sent, 0);
  const pct = total ? Math.round((sent / total) * 100) : 0;

  return (
    <>
      <p className="note">
        Only the <code>1.DB_Member</code> sheet is read; other sheets are listed and
        skipped. The file is processed on this device and sent in small batches, so a
        large workbook or a slow connection is fine. Members that already exist are
        updated rather than duplicated, so uploading the same file twice is safe.
      </p>

      <div className={`drop${over ? ' over' : ''}`}
           onDragOver={(e) => { e.preventDefault(); setOver(true); }}
           onDragLeave={() => setOver(false)}
           onDrop={(e) => {
             e.preventDefault(); setOver(false);
             const f = e.dataTransfer.files?.[0];
             if (f && !busy) handleFile(f);
           }}>
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.csv"
               onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        <p style={{ marginTop: 0 }}>Drop an .xlsx file here, or</p>
        <button onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? 'Working…' : 'Choose a file'}
        </button>
        {busy && (
          <button className="quiet" style={{ marginLeft: 10 }}
                  onClick={() => { cancelled.current = true; }}>Stop</button>
        )}
        <p className="note" style={{ margin: '14px auto 0' }}>
          <a href="/api/template">Download a blank template</a> with the exact headers.
        </p>
      </div>

      {busy && total > 0 && (
        <>
          <div style={{ height: 6, background: 'var(--rule)', marginTop: 20 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', transition: 'width .2s' }} />
          </div>
          <p className="note" style={{ marginTop: 8 }}>{pct}% — {status}</p>
        </>
      )}
      {!busy && status && <div className="msg ok">{status}</div>}
      {error && <div className="msg">{error}</div>}

      {sheets.length > 0 && (
        <>
          <h3>Result</h3>
          <div className="scroller">
            <table>
              <thead>
                <tr>
                  <th>Sheet</th><th className="num">Rows</th>
                  <th className="num">Imported</th><th className="num">Failed</th><th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {sheets.map((s) => (
                  <tr key={s.sheet}>
                    <td>{s.sheet}</td>
                    <td className="num">{s.total}</td>
                    <td className="num">{s.ok}</td>
                    <td className="num">{s.failed}</td>
                    <td>
                      {s.skipped ? s.skipped
                        : !s.done ? `${Math.round((s.sent / Math.max(s.total, 1)) * 100)}%`
                        : s.errors.length ? `Row ${s.errors[0].row}: ${s.errors[0].problem.slice(0, 50)}`
                        : 'Clean'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {sheets.some((s) => s.errors.length > 0) && (
            <>
              <h3>Rows that need fixing</h3>
              <div className="scroller">
                <table>
                  <thead><tr><th className="num">Excel row</th><th>Problem</th></tr></thead>
                  <tbody>
                    {sheets.flatMap((s) => s.errors.map((e, i) => (
                      <tr key={`${s.sheet}-${i}`}>
                        <td className="num">{e.row}</td>
                        <td>{e.problem}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
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
