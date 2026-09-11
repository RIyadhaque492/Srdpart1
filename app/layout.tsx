import './globals.css';
import type { Metadata } from 'next';
import Shell from './components/Shell';

export const metadata: Metadata = {
  title: 'SRD loan operations',
  description: 'Member register, proposals, feasibility and loan approval.',
};

/**
 * No webfonts on purpose. Officers use this on connections as slow as a few
 * KB/s, where 100 KB of font files is a real delay, and every device that
 * needs Bangla already ships a Bangla face. The stack in globals.css picks
 * the best one installed.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
