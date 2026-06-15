'use client';

import Image from 'next/image';
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
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/kova-mark-dark.png"
              alt="KOVA"
              width={32}
              height={32}
              className="h-8 w-8 rounded-md"
              priority
            />
            <span className="text-lg font-bold tracking-tight text-white">KOVA</span>
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
