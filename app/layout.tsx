import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SRD — member register',
  description: 'Entry 01: member profiles.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="masthead">
            <h1>SRD member register</h1>
            <nav>
              <Link href="/">Overview</Link>
              <Link href="/members">Members</Link>
              <Link href="/members/new">Add member</Link>
              <Link href="/import">Upload</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
