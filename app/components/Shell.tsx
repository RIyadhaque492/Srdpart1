'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const GROUPS = [
  {
    title: 'Register',
    links: [
      { href: '/', label: 'Overview' },
      { href: '/members', label: 'Members' },
      { href: '/members/new', label: 'Add members' },
    ],
  },
  {
    title: 'Lending',
    links: [
      { href: '/proposals', label: 'Proposals' },
      { href: '/proposals/new', label: 'New proposal' },
      { href: '/feasibility', label: 'Feasibility', badge: 'feasibility' as const },
      { href: '/approvals', label: 'Committee', badge: 'committee' as const },
    ],
  },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<{ feasibility: number; committee: number } | null>(null);
  const path = usePathname();

  useEffect(() => { setOpen(false); }, [path]);   // close the drawer on navigate

  useEffect(() => {
    fetch('/api/counts').then((r) => r.json()).then(setCounts).catch(() => setCounts(null));
  }, [path]);

  const current = GROUPS.flatMap((g) => g.links).find((l) => l.href === path);

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>

      <header className="topbar">
        <button className="burger" onClick={() => setOpen((o) => !o)}
                aria-expanded={open} aria-label="Menu">
          <span /><span /><span />
        </button>
        <span className="topbar-title">{current?.label ?? 'SRD'}</span>
      </header>

      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <nav className={`side${open ? ' open' : ''}`} aria-label="Sections">
        <div className="brand">
          <span className="brand-mark">SRD</span>
          <span className="brand-sub">Loan operations</span>
        </div>

        {GROUPS.map((g) => (
          <div className="group" key={g.title}>
            <p className="group-title">{g.title}</p>
            {g.links.map((l) => {
              const n = l.badge && counts ? counts[l.badge] : 0;
              return (
                <Link key={l.href} href={l.href}
                      className={`navlink${path === l.href ? ' on' : ''}`}>
                  {l.label}
                  {n > 0 && <span className="count">{n}</span>}
                </Link>
              );
            })}
          </div>
        ))}

        <p className="sidefoot">Entry 01–04 · Chattogram</p>
      </nav>

      <main id="main" className="main">{children}</main>
    </div>
  );
}
