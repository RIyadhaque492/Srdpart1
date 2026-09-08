'use client';

import { useState, useEffect, useMemo } from 'react';

interface Lookups {
  areas: { code: string; name: string }[];
  zones: { id: string; name: string; area_code: string | null }[];
  categories: { code: string; name: string }[];
  types: { code: string; name: string; category_code: string | null }[];
}

const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const EMPTY = {
  member_name: '', primary_contact: '', nid_no: '', business_name: '', business_address: '',
  area_code: '', zone_id: '', category_code: '', business_type_code: '',
  profile_date: new Date().toISOString().slice(0, 10),
  father_name: '', mother_name: '', spouse_name: '', spouse_contact: '',
  present_address: '', permanent_address: '', gender: '', religion: '',
  client_dob: '', perm_thana: '', off_day: 'Fri', old_mcl: '',
};

export default function NewMember() {
  const [form, setForm] = useState({ ...EMPTY });
  const [lk, setLk] = useState<Lookups | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dupes, setDupes] = useState<{ profile_id: string; member_name: string }[]>([]);
  const [saved, setSaved] = useState<{ profile_id: string; member_name: string } | null>(null);

  useEffect(() => {
    fetch('/api/lookups').then((r) => r.json()).then(setLk).catch(() => setLk(null));
  }, []);

  const set = (k: string, v: string) => {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // clear the child when the parent changes, so no impossible pairs
      if (k === 'area_code') next.zone_id = '';
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
      if (res.status === 409 && data.duplicates) {
        setDupes(data.duplicates); setError(data.error);
      } else if (!res.ok) {
        setError(data.error ?? 'Could not save.');
      } else {
        setSaved(data);
        setForm({ ...EMPTY });
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const Text = ({ k, label, type = 'text', hint }: { k: keyof typeof EMPTY; label: string; type?: string; hint?: string }) => (
    <div className="field">
      <label htmlFor={k}>{label}</label>
      <input id={k} type={type} value={form[k]} inputMode={type === 'tel' ? 'numeric' : undefined}
             onChange={(e) => set(k, e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <>
      <h2>Add a member</h2>
      <p className="note">
        The Profile ID is assigned automatically. Only the name and contact number are
        required — everything else can be filled in later.
      </p>

      {saved && (
        <div className="msg ok">
          Saved <strong>{saved.member_name}</strong> as Profile ID <strong>{saved.profile_id}</strong>.
          The form is cleared and ready for the next one.
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
              <button className="quiet" onClick={() => save(true)} disabled={busy}>
                Save anyway
              </button>
            </>
          )}
        </div>
      )}

      <h3>Member</h3>
      <div className="grid2">
        <Text k="member_name" label="Member name *" />
        <Text k="primary_contact" label="Primary contact *" type="tel" hint="11 digits, e.g. 01712345678" />
        <Text k="nid_no" label="NID number" hint="10, 13 or 17 digits" />
        <Text k="client_dob" label="Date of birth" type="date" />
        <div className="field">
          <label htmlFor="gender">Gender</label>
          <select id="gender" value={form.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="">—</option>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </div>
        <Text k="religion" label="Religion" />
        <Text k="father_name" label="Father's name" />
        <Text k="mother_name" label="Mother's name" />
        <Text k="spouse_name" label="Spouse name" />
        <Text k="spouse_contact" label="Spouse contact" type="tel" />
      </div>

      <h3>Business</h3>
      <div className="grid2">
        <Text k="business_name" label="Business name" hint="Bangla / English is split automatically" />
        <Text k="business_address" label="Business address" />
        <div className="field">
          <label htmlFor="area_code">Business area</label>
          <select id="area_code" value={form.area_code} onChange={(e) => set('area_code', e.target.value)}>
            <option value="">—</option>
            {lk?.areas.map((a) => <option key={a.code} value={a.code}>{a.code}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="zone_id">Zone {form.area_code && <span className="hint">({zones.length} in {form.area_code})</span>}</label>
          <select id="zone_id" value={form.zone_id} onChange={(e) => set('zone_id', e.target.value)}>
            <option value="">{form.area_code ? '—' : 'Pick an area first'}</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.id} — {z.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="category_code">Business category</label>
          <select id="category_code" value={form.category_code} onChange={(e) => set('category_code', e.target.value)}>
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
        <Text k="old_mcl" label="Old MCL" />
      </div>

      <h3>Addresses</h3>
      <div className="grid2">
        <Text k="present_address" label="Present address" />
        <Text k="permanent_address" label="Permanent address" />
        <Text k="perm_thana" label="Permanent thana" />
        <Text k="profile_date" label="Profile date" type="date" />
      </div>

      <div style={{ marginTop: 22, display: 'flex', gap: 10 }}>
        <button onClick={() => save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save member'}
        </button>
        <button className="quiet" onClick={() => { setForm({ ...EMPTY }); setError(null); setDupes([]); setSaved(null); }}
                disabled={busy}>
          Clear
        </button>
      </div>
    </>
  );
}
