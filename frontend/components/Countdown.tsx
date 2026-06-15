'use client';

import { useEffect, useState } from 'react';

export function Countdown({ deadlineMs }: { deadlineMs: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, deadlineMs - now);
  if (remaining === 0) return <span className="text-zinc-500">expired</span>;

  const seconds = Math.floor(remaining / 1000);
  return (
    <span className="tabular-nums text-zinc-400">
      {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
    </span>
  );
}
