'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { stageSheet, type ParsedSheet } from '@/lib/parse';

const bdt = (n: unknown) =>
  n == null || n === '' ? '—' : '৳' + Number(n).toLocaleString('en-IN');

export default function NewProposal() {
  const [tab, setTab] = useState<'one' | 'file'>('one');
  return (
    <>
      <h2>New proposal</h2>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'one'} className={`tab${tab === 'one' ? ' on' : ''}`}
                onClick={() => setTab('one')}>One at a time</button>
        <button role="tab" aria-selected={tab === 'file'} className={`tab${tab === 'file' ? ' on' : ''}`}
                onClick={() => setTab('file')}>From a file</button>
      </div>
      {tab === 'one' ? <ManualEntry /> : <FileUpload />}
    </>
  );
}

/* ------------------------------------------------------------ manual entry */

interface MemberHit { profile_id: string; member_name: string; primary_contact: string | null }
interface Detail {
  member: {
    profile_id: string; member_name: string; business_name: string | null;
    area_code: string | null; zone_id: string | null; zone_name: string | null;
    category_name: string | null; off_day: string | null;
    no_of_portfolios: number | null; last_portfolio: string | null; pf_status: string | null;
    lfd: string | null; led: string | null; lsd: string | null; old_loan_amount: string | null;
  };
  portfolios: { portfolio_no: string; investment_amount: string; status: string | null }[];
}
interface Quote {
  installment: string; total_receivable: string; installments: number; from_schedule: boolean;
}

function ManualEntry() {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<MemberHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);

  const [oldMcl, setOldMcl] = useState('New');
  const [prospectDate, setProspectDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState('');
  const [months, setMonths] = useState('');
  const [zeroInstall, setZeroInstall] = useState(false);
  const [crScore, setCrScore] = useState('');

  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ proposal_id: string; stage: string }[]>([]);
  const [saved, setSaved] = useState<{ proposal_id: string; customer_name: string; proposed_installment: string } | null>(null);

  // search members as the user types
  useEffect(() => {
    if (detail || q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/members?q=${encodeURIComponent(q)}&limit=8`);
        setHits(await res.json());
      } catch { setHits([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, detail]);

  async function pick(id: string) {
    setHits([]); setError(null);
    try {
      const res = await fetch(`/api/members/${encodeURIComponent(id)}`);
      const d: Detail = await res.json();
      setDetail(d);
      setOldMcl(d.member.last_portfolio ?? 'New');
    } catch {
      setError('Could not load that member.');
    }
  }

  // live installment preview
  useEffect(() => {
    const a = Number(amount), m = Number(months);
    if (!a || !m || !detail) { setQuote(null); return; }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/quote?amount=${a}&months=${m}&offday=${detail.member.off_day ?? 'Fri'}`);
        setQuote(res.ok ? await res.json() : null);
      } catch { setQuote(null); }
    }, 250);
    return () => clearTimeout(t);
  }, [amount, months, detail]);

  function reset() {
    setQ(''); setHits([]); setDetail(null); setOldMcl('New');
    setAmount(''); setMonths(''); setZeroInstall(false); setCrScore('');
    setQuote(null); setError(null); setOpen([]);
  }

  async function save(allowDuplicate = false) {
    setBusy(true); setError(null); setSaved(null);
    try {
      const res = await fetch('/api/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profile_id: detail?.member.profile_id,
          old_mcl: oldMcl,
          prospect_date: prospectDate,
          proposed_loan_amount: Number(amount),
          proposed_duration_months: Number(months),
          zero_install: zeroInstall,
          cr_score: crScore ? Number(crScore) : null,
          allow_duplicate: allowDuplicate,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.open) { setOpen(data.open); setError(data.error); }
      else if (!res.ok) setError(data.error ?? 'Could not save.');
      else { setSaved(data); reset(); }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <p className="note">
        Pick the member first — area, zone, off day and previous loans come from their
        profile. Only the amount, duration and date are typed.
      </p>

      {saved && (
        <div className="msg ok">
          Proposal <strong>{saved.proposal_id}</strong> created for {saved.customer_name} at{' '}
          <strong>{bdt(saved.proposed_installment)}</strong> per installment.
        </div>
      )}
      {error && (
        <div className="msg">
          {error}
          {open.length > 0 && (
            <>
              <ul style={{ margin: '8px 0 8px 18px' }}>
                {open.map((o) => <li key={o.proposal_id}>{o.proposal_id} — {o.stage}</li>)}
              </ul>
              <button className="quiet" onClick={() => save(true)} disabled={busy}>Create anyway</button>
            </>
          )}
        </div>
      )}

      <h3>Member</h3>
      {!detail ? (
        <>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="q">Search by name, Profile ID or contact</label>
            <input id="q" value={q} onChange={(e) => setQ(e.target.value)}
                   placeholder="Start typing…" autoComplete="off" />
            {searching && <span className="hint">Searching…</span>}
          </div>
          {hits.length > 0 && (
            <table style={{ maxWidth: 560 }}>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.profile_id} onClick={() => pick(h.profile_id)}
                      style={{ cursor: 'pointer' }}>
                    <td>{h.profile_id}</td>
                    <td>{h.member_name}</td>
                    <td>{h.primary_contact ?? '—'}</td>
                    <td style={{ color: 'var(--accent)' }}>Choose</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <div className="picked">
            <div>
              <strong>{detail.member.member_name}</strong> · {detail.member.profile_id}
              <div className="hint">{detail.member.business_name ?? 'No business name'}</div>
            </div>
            <button className="quiet" onClick={reset}>Change</button>
          </div>

          <table style={{ marginTop: 12 }}>
            <tbody>
              <tr><th>Area / Zone</th><td>{detail.member.area_code ?? '—'} · {detail.member.zone_name ?? '—'}</td></tr>
              <tr><th>Category</th><td>{detail.member.category_name ?? '—'}</td></tr>
              <tr><th>Off day</th><td>{detail.member.off_day ?? '—'}</td></tr>
              <tr><th>Previous loans</th><td>{detail.member.no_of_portfolios ?? 0} · last {detail.member.last_portfolio ?? '—'} ({detail.member.pf_status ?? '—'})</td></tr>
              <tr><th>Last loan amount</th><td>{bdt(detail.member.old_loan_amount)}</td></tr>
              <tr><th>LFD / LED / LSD</th><td>
                {[detail.member.lfd, detail.member.led, detail.member.lsd]
                  .map((d) => d ? String(d).slice(0, 10) : '—').join(' · ')}
              </td></tr>
            </tbody>
          </table>
        </>
      )}

      {detail && (
        <>
          <h3>Proposal</h3>
          <div className="grid2">
            <div className="field">
              <label htmlFor="oldMcl">Old MCL</label>
              <select id="oldMcl" value={oldMcl} onChange={(e) => setOldMcl(e.target.value)}>
                <option value="New">New</option>
                {detail.portfolios.map((p) => (
                  <option key={p.portfolio_no} value={p.portfolio_no}>
                    {p.portfolio_no} — {bdt(p.investment_amount)} ({p.status ?? '—'})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="pdate">Prospect date</label>
              <input id="pdate" type="date" value={prospectDate}
                     onChange={(e) => setProspectDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="amt">Proposed loan amount *</label>
              <input id="amt" type="number" inputMode="numeric" value={amount}
                     onChange={(e) => setAmount(e.target.value)} placeholder="150000" />
            </div>
            <div className="field">
              <label htmlFor="mon">Duration in months *</label>
              <input id="mon" type="number" inputMode="numeric" min={1} max={24} value={months}
                     onChange={(e) => setMonths(e.target.value)} placeholder="6" />
            </div>
            <div className="field">
              <label htmlFor="cr">CR score</label>
              <input id="cr" type="number" step="0.01" value={crScore}
                     onChange={(e) => setCrScore(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="zi">Zero install</label>
              <select id="zi" value={zeroInstall ? 'yes' : 'no'}
                      onChange={(e) => setZeroInstall(e.target.value === 'yes')}>
                <option value="no">No</option><option value="yes">Yes</option>
              </select>
            </div>
          </div>

          {quote && (
            <div className={`quote${quote.from_schedule ? '' : ' estimate'}`}>
              <div>
                <span className="big">{bdt(quote.installment)}</span>
                <span className="hint"> per installment</span>
              </div>
              <div className="hint">
                {quote.installments} installments · {bdt(quote.total_receivable)} total ·{' '}
                {quote.from_schedule
                  ? 'from the rate schedule'
                  : 'estimated — this amount and duration are not in the rate schedule, so check it by hand'}
              </div>
            </div>
          )}

          <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
            <button onClick={() => save()} disabled={busy || !amount || !months}>
              {busy ? 'Saving…' : 'Create proposal'}
            </button>
            <button className="quiet" onClick={reset} disabled={busy}>Clear</button>
          </div>
        </>
      )}
    </>
  );
}

/* ------------------------------------------------------------- file upload */

const TARGET_BYTES = 60 * 1024;

function splitBySize<T>(rows: T[]): T[][] {
  if (!rows.length) return [];
  const perRow = new Blob([JSON.stringify(rows)]).size / rows.length;
  const size = Math.max(1, Math.min(500, Math.floor(TARGET_BYTES / perRow)));
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

  const post = useCallback(async (
    rows: unknown[], attempt = 0,
  ): Promise<{ ok: number; errors: { row: number; problem: string }[] }> => {
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'proposals', rows }),
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
        return p.target && p.target !== 'proposals'
          ? { ...p, rows: [], errors: [], skipped: 'Not this step' }
          : p;
      });

      setSheets(parsed.map((p) => ({
        sheet: p.sheet, total: p.rows.length, sent: 0, ok: 0,
        failed: p.errors.length, errors: p.errors, skipped: p.skipped,
        done: !!p.skipped || p.rows.length === 0,
      })));

      const target = parsed.find((p) => p.target === 'proposals');
      if (!target || !target.rows.length) {
        setStatus('No proposal rows found. The sheet should be named 2.PC_ClntMgt.');
        return;
      }

      let done = 0;
      for (const slice of splitBySize(target.rows)) {
        if (cancelled.current) break;
        setStatus(`Proposals: ${done + 1}–${done + slice.length} of ${target.rows.length}`);
        done += slice.length;
        try {
          const res = await post(slice);
          setSheets((prev) => prev.map((s) => s.sheet !== target.sheet ? s : {
            ...s, sent: s.sent + slice.length, ok: s.ok + res.ok,
            failed: s.failed + res.errors.length,
            errors: [...s.errors, ...res.errors].slice(0, 50),
            done: s.sent + slice.length >= s.total,
          }));
        } catch (e) {
          setSheets((prev) => prev.map((s) => s.sheet !== target.sheet ? s : {
            ...s, sent: s.sent + slice.length, failed: s.failed + slice.length,
            errors: [...s.errors, { row: (slice[0] as { excelRow: number }).excelRow,
              problem: `Batch failed: ${(e as Error).message}` }].slice(0, 50),
            done: s.sent + slice.length >= s.total,
          }));
        }
      }
      setStatus(cancelled.current ? 'Stopped. Upload the same file again to carry on.' : 'Finished.');
    } catch (e) {
      setError(`Could not read that file: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  const total = sheets.reduce((a, s) => a + s.total, 0);
  const sent = sheets.reduce((a, s) => a + s.sent, 0);
  const pct = total ? Math.round((sent / total) * 100) : 0;

  return (
    <>
      <p className="note">
        Only the <code>2.PC_ClntMgt</code> sheet is read. Every proposal must point at a
        member already on file, so import members first — rows for unknown members are
        reported rather than guessed at.
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
        {busy && <button className="quiet" style={{ marginLeft: 10 }}
                         onClick={() => { cancelled.current = true; }}>Stop</button>}
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
          <table>
            <thead><tr><th>Sheet</th><th className="num">Rows</th><th className="num">Imported</th>
              <th className="num">Failed</th><th>Notes</th></tr></thead>
            <tbody>
              {sheets.map((s) => (
                <tr key={s.sheet}>
                  <td>{s.sheet}</td><td className="num">{s.total}</td>
                  <td className="num">{s.ok}</td><td className="num">{s.failed}</td>
                  <td>{s.skipped ? s.skipped
                    : !s.done ? `${Math.round((s.sent / Math.max(s.total, 1)) * 100)}%`
                    : s.errors.length ? `Row ${s.errors[0].row}: ${s.errors[0].problem.slice(0, 50)}`
                    : 'Clean'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {sheets.some((s) => s.errors.length > 0) && (
            <>
              <h3>Rows that need fixing</h3>
              <table>
                <thead><tr><th className="num">Excel row</th><th>Problem</th></tr></thead>
                <tbody>
                  {sheets.flatMap((s) => s.errors.map((e, i) => (
                    <tr key={`${s.sheet}-${i}`}><td className="num">{e.row}</td><td>{e.problem}</td></tr>
                  )))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </>
  );
}
