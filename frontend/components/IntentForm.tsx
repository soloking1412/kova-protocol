'use client';

import { useEffect, useRef, useState } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { buildCreateIntentTx, getQuote, TESTNET_TOKENS } from '@kova/sdk';
import { isConfigured, kovaConfig, parseUnits } from '@/lib/kova';

const SLIPPAGE_PRESETS = [0.5, 1, 2];

type QuoteState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; outputHuman: number }
  | { status: 'none' }
  | { status: 'small' }
  | { status: 'error' };

export function IntentForm() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutate, isPending } = useSignAndExecuteTransaction();

  const [fromSymbol, setFromSymbol] = useState('SUI');
  const [toSymbol, setToSymbol] = useState('DBUSDC');
  const [amount, setAmount] = useState('');
  const [minReceived, setMinReceived] = useState('');
  const [slippage, setSlippage] = useState(1);
  const [minutes, setMinutes] = useState(2);
  const [status, setStatus] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteState>({ status: 'idle' });

  // True once the user types their own floor, so a fresh quote won't overwrite it.
  const minEdited = useRef(false);

  const from = TESTNET_TOKENS.find((t) => t.symbol === fromSymbol)!;
  const to = TESTNET_TOKENS.find((t) => t.symbol === toSymbol)!;
  const toOptions = TESTNET_TOKENS.filter((t) => t.symbol !== fromSymbol);

  // Fetch a live DeepBook quote (debounced) whenever the input pair or amount changes.
  useEffect(() => {
    minEdited.current = false;
    if (!amount || Number(amount) <= 0) {
      setQuote({ status: 'idle' });
      return;
    }
    let cancelled = false;
    setQuote({ status: 'loading' });
    const handle = setTimeout(async () => {
      try {
        const result = await getQuote({
          network: kovaConfig.network,
          inputType: from.type,
          inputAmount: parseUnits(amount, from.decimals),
          outputType: to.type,
          address: account?.address,
        });
        if (cancelled) return;
        if (!result) setQuote({ status: 'none' });
        else if (result.outputAmount <= 0n) setQuote({ status: 'small' });
        else setQuote({ status: 'ok', outputHuman: result.outputHuman });
      } catch {
        if (!cancelled) setQuote({ status: 'error' });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [amount, fromSymbol, toSymbol, account?.address, from.type, from.decimals, to.type]);

  // Pre-fill the floor from the quote, unless the user has set it by hand.
  useEffect(() => {
    if (quote.status !== 'ok' || minEdited.current) return;
    const floor = quote.outputHuman * (1 - slippage / 100);
    setMinReceived(formatAmount(floor, to.decimals));
  }, [quote, slippage, to.decimals]);

  async function submit() {
    if (!account || !amount || !minReceived) return;
    try {
      setStatus('Preparing intent…');
      const inputAmount = parseUnits(amount, from.decimals);
      const minOutputAmount = parseUnits(minReceived, to.decimals);

      let inputCoinObjectId: string | undefined;
      if (from.symbol !== 'SUI') {
        const coins = await client.getCoins({ owner: account.address, coinType: from.type });
        const coin = coins.data.find((c) => BigInt(c.balance) >= inputAmount);
        if (!coin) {
          setStatus(`No ${from.symbol} coin with enough balance`);
          return;
        }
        inputCoinObjectId = coin.coinObjectId;
      }

      const tx = buildCreateIntentTx(kovaConfig, {
        inputType: from.type,
        inputAmount,
        inputCoinObjectId,
        outputType: to.type,
        minOutputAmount,
        deadlineOffsetMs: minutes * 60_000,
      });

      setStatus('Awaiting signature…');
      mutate(
        { transaction: tx },
        {
          onSuccess: (result) =>
            setStatus(`Intent live — solvers competing. tx ${result.digest.slice(0, 10)}…`),
          onError: (error) => setStatus(`Error: ${error.message}`),
        },
      );
    } catch (error) {
      setStatus(`Error: ${(error as Error).message}`);
    }
  }

  return (
    <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h2 className="text-lg font-semibold text-white">Express your intent</h2>
      <p className="mt-1 text-sm text-zinc-400">
        Lock your input, set a floor, and let solvers compete to fill it.
      </p>

      <div className="mt-5 space-y-4">
        <Field label="You give">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-white outline-none"
          />
          <TokenSelect value={fromSymbol} onChange={setFromSymbol} options={TESTNET_TOKENS} />
        </Field>

        <Field label="You receive (minimum)">
          <input
            type="number"
            inputMode="decimal"
            value={minReceived}
            onChange={(e) => {
              minEdited.current = true;
              setMinReceived(e.target.value);
            }}
            placeholder="0.00"
            className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-white outline-none"
          />
          <TokenSelect value={toSymbol} onChange={setToSymbol} options={toOptions} />
        </Field>

        <QuoteHint quote={quote} symbol={to.symbol} slippage={slippage} />

        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">Slippage</span>
          <div className="flex gap-1">
            {SLIPPAGE_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  minEdited.current = false;
                  setSlippage(preset);
                }}
                className={`rounded-md px-2.5 py-1 text-xs transition ${
                  slippage === preset
                    ? 'bg-violet-600 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:text-white'
                }`}
              >
                {preset}%
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-sm text-zinc-400">Deadline: {minutes} min</label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="mt-1 w-full accent-violet-500"
          />
        </div>

        <button
          onClick={submit}
          disabled={!account || !amount || !minReceived || isPending || !isConfigured}
          className="w-full rounded-xl bg-violet-600 py-3 font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
        >
          {!isConfigured
            ? 'Set NEXT_PUBLIC_KOVA_PACKAGE_ID'
            : !account
              ? 'Connect wallet'
              : isPending
                ? 'Submitting…'
                : 'Submit intent'}
        </button>

        {status && <p className="text-sm text-zinc-400">{status}</p>}
      </div>
    </div>
  );
}

function QuoteHint({
  quote,
  symbol,
  slippage,
}: {
  quote: QuoteState;
  symbol: string;
  slippage: number;
}) {
  if (quote.status === 'idle') return null;

  let text: string;
  let tone = 'text-zinc-500';
  switch (quote.status) {
    case 'loading':
      text = 'Fetching best price…';
      break;
    case 'ok':
      text = `Market ≈ ${formatAmount(quote.outputHuman, 6)} ${symbol} · floor set ${slippage}% below`;
      tone = 'text-violet-300';
      break;
    case 'none':
      text = 'No DeepBook route for this pair yet — set a minimum manually.';
      tone = 'text-amber-400/80';
      break;
    case 'small':
      text = 'Amount is below the pool lot size — try a larger amount.';
      tone = 'text-amber-400/80';
      break;
    case 'error':
      text = "Couldn't fetch a quote — set a minimum manually.";
      tone = 'text-amber-400/80';
      break;
  }
  return <p className={`text-xs ${tone}`}>{text}</p>;
}

function formatAmount(value: number, decimals: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, '');
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm text-zinc-400">{label}</label>
      <div className="mt-1 flex gap-2">{children}</div>
    </div>
  );
}

function TokenSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (symbol: string) => void;
  options: { symbol: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg bg-zinc-800 px-3 py-2 text-white outline-none"
    >
      {options.map((t) => (
        <option key={t.symbol} value={t.symbol}>
          {t.symbol}
        </option>
      ))}
    </select>
  );
}
