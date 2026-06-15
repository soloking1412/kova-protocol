import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import '@mysten/dapp-kit/dist/index.css';
import { Providers } from './providers';
import { Nav } from '@/components/Nav';

export const metadata: Metadata = {
  title: 'KOVA Protocol',
  description: 'Native intent & solver settlement layer for Sui',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="mx-auto max-w-5xl px-4 py-10">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
