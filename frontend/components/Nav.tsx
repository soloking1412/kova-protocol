'use client';

import Link from 'next/link';
import { ConnectButton } from '@mysten/dapp-kit';

const links = [
  { href: '/', label: 'Swap' },
  { href: '/intents', label: 'Intents' },
  { href: '/solvers', label: 'Solvers' },
];

export function Nav() {
  return (
    <header className="border-b border-zinc-800">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-white">
            KOVA
          </Link>
          <nav className="flex gap-5 text-sm text-zinc-400">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="transition hover:text-zinc-100">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <ConnectButton />
      </div>
    </header>
  );
}
