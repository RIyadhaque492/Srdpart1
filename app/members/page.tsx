'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface Member {
  profile_id: string; member_name: string; primary_contact: string | null;
  nid_no: string | null; business_name: string | null; area_code: string | null;
  zone_id: string | null; off_day: string | null;
  no_of_portfolios: number | null; pf_status: string | null;
}

export default function Members() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Member[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (query: string) => {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/members?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setRows(await res.json());
    } catch (e) {
      setError(`Could not load members: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { load(''); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => load(q), 300);   // wait for typing to settle
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <>
      <h2>Members</h2>
      <div className="field" style={{ maxWidth: 420 }}>
        <label htmlFor="q">Search by name, Profile ID, contact or NID</label>
        <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" />
      </div>

      {error && <div className="msg">{error}</div>}
      {busy && <p className="note">Loading…</p>}

      {!busy && rows.length === 0 && (
        <p className="note">
          No members found. <Link href="/members/new">Add one</Link> or{' '}
          <Link href="/members/new">upload a workbook</Link>.
        </p>
      )}

      {rows.length > 0 && (
        <>
          <p className="note">{rows.length} shown{rows.length === 50 || rows.length === 200 ? ' (newest first — search to narrow)' : ''}.</p>
          <div className="scroller">
            <table>
              <thead>
                <tr>
                  <th>Profile</th><th>Name</th><th>Contact</th><th>Business</th>
                  <th>Area</th><th>Zone</th><th>Off day</th><th className="num">Portfolios</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.profile_id}>
                    <td>{m.profile_id}</td>
                    <td>{m.member_name}</td>
                    <td>{m.primary_contact ?? '—'}</td>
                    <td>{m.business_name ?? '—'}</td>
                    <td>{m.area_code ?? '—'}</td>
                    <td>{m.zone_id ?? '—'}</td>
                    <td>{m.off_day ?? '—'}</td>
                    <td className="num">{m.no_of_portfolios ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
