import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SRD — loan operations',
  description: 'Members and loan proposals.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="masthead">
            <h1>SRD loan operations</h1>
            <nav>
              <Link href="/">Overview</Link>
              <Link href="/members">Members</Link>
              <Link href="/members/new">Add members</Link>
              <Link href="/proposals">Proposals</Link>
              <Link href="/proposals/new">New proposal</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
