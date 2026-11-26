import { FormEvent, useEffect, useRef, useState } from 'react';
import QrScanner from 'qr-scanner';
import { Camera, Keyboard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { recordPurchase, redeem } from '../lib/actions';
import type { Card, Customer } from '../lib/types';
import { formatMoney, mainBalance, toPoints, usesPoints } from '../../supabase/functions/_shared/balance';
import { Alert, Button, Input, Panel } from '../components/ui';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Finds the customer from a scanned QR (the token) or a pasted card link. RLS keeps it to this business. */
async function findCustomer(text: string): Promise<Customer | null> {
  const token = UUID.exec(text)?.[0];
  if (!token) return null;
  const { data } = await supabase.from('customers').select('*').eq('token', token).maybeSingle();
  return data as Customer | null;
}

export default function ScannerPage() {
  const { card } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [error, setError] = useState('');

  if (!card) return <Alert kind="info">Primero crea tu tarjeta en la pestaña “Tarjeta”.</Alert>;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl">Escanear</h1>
      {error && <Alert kind="error">{error}</Alert>}
      {customer ? (
        <CustomerActions card={card} customer={customer} onChange={setCustomer} onDone={() => setCustomer(null)} />
      ) : (
        <Finder
          onFound={(c) => {
            setError('');
            setCustomer(c);
          }}
          onError={setError}
        />
      )}
    </div>
  );
}

function Finder({ onFound, onError }: { onFound: (c: Customer) => void; onError: (m: string) => void }) {
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  // Latest callbacks without restarting the camera on every parent render
  const handlers = useRef({ onFound, onError });
  handlers.current = { onFound, onError };

  useEffect(() => {
    if (manual || !video.current) return;
    const scanner = new QrScanner(
      video.current,
      async ({ data }) => {
        if (busy.current) return;
        busy.current = true;
        const found = await findCustomer(data);
        if (found) {
          scanner.stop();
          handlers.current.onFound(found);
        } else {
          handlers.current.onError('Este QR no es una tarjeta de tu negocio.');
        }
        busy.current = false;
      },
      { highlightScanRegion: true, returnDetailedScanResult: true },
    );
    scanner.start().catch(() => {
      handlers.current.onError('No se pudo abrir la cámara. Revisa los permisos o ingresa el código a mano.');
      setManual(true);
    });
    return () => scanner.destroy();
  }, [manual]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = await findCustomer(text);
    if (found) onFound(found);
    else onError('No encontramos esa tarjeta.');
  }

  return (
    <Panel className="space-y-4">
      {manual ? (
        <form onSubmit={submit} className="space-y-3">
          <Input label="Código o enlace de la tarjeta" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" className="w-full">Buscar</Button>
        </form>
      ) : (
        <video ref={video} className="aspect-square w-full rounded-xl bg-black object-cover" muted playsInline />
      )}
      <button onClick={() => setManual(!manual)} className="flex w-full items-center justify-center gap-2 text-sm text-primary">
        {manual ? <><Camera className="h-4 w-4" /> Usar la cámara</> : <><Keyboard className="h-4 w-4" /> Ingresar código a mano</>}
      </button>
    </Panel>
  );
}

function CustomerActions({
  card,
  customer,
  onChange,
  onDone,
}: {
  card: Card;
  customer: Customer;
  onChange: (c: Customer) => void;
  onDone: () => void;
}) {
  const { business } = useAuth();
  const currency = business?.currency ?? 'USD';
  const points = usesPoints(card);
  const [amount, setAmount] = useState('');
  const [stamps, setStamps] = useState(1);
  const [redeemValue, setRedeemValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const balance = mainBalance(card, customer, currency);
  const amountNumber = Number(amount.replace(',', '.'));
  const earned = card.kind === 'cashback' && amountNumber > 0
    ? Math.round(amountNumber * Number(card.cashback_percent)) / 100
    : 0;

  async function run(action: () => Promise<Customer>, success: string) {
    setBusy(true);
    setResult(null);
    try {
      onChange(await action());
      setResult({ kind: 'success', text: success });
      setAmount('');
      setRedeemValue('');
    } catch (e) {
      setResult({ kind: 'error', text: (e as Error).message });
    }
    setBusy(false);
  }

  function purchase(e: FormEvent) {
    e.preventDefault();
    if (!(amountNumber > 0)) return setResult({ kind: 'error', text: 'Escribe el monto de la compra.' });
    const text = card.kind === 'stamps'
      ? `+${stamps} sello${stamps > 1 ? 's' : ''}`
      : `+${points ? `${toPoints(earned, card)} ${card.points_name}` : formatMoney(earned, currency)}`;
    run(() => recordPurchase(customer.id, amountNumber, stamps), `Compra registrada: ${text}`);
  }

  function redeemNow() {
    if (card.kind === 'stamps') return run(() => redeem(customer.id), `Premio canjeado: ${card.reward_name}`);
    const value = Number(redeemValue.replace(',', '.'));
    if (!(value > 0)) return setResult({ kind: 'error', text: 'Escribe cuánto quiere canjear.' });
    // Points are typed as points but redeemed as money
    const money = points ? value / card.points_per_unit : value;
    run(() => redeem(customer.id, Math.round(money * 100) / 100), 'Canje registrado.');
  }

  return (
    <div className="space-y-4">
      <Panel className="text-center">
        <p className="text-lg font-semibold">{customer.first_name}</p>
        <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">{balance.label}</p>
        <p className="text-4xl font-semibold tracking-tight">{balance.value}</p>
        {card.kind === 'stamps' && <p className="mt-1 text-sm text-gray-500">Premios disponibles: {customer.rewards}</p>}
      </Panel>

      {result && <Alert kind={result.kind}>{result.text}</Alert>}

      <Panel>
        <form onSubmit={purchase} className="space-y-3">
          <p className="font-medium">Registrar compra</p>
          <Input label={`Monto (${currency})`} inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
          {card.kind === 'stamps' ? (
            <Input label="Sellos" type="number" min={1} max={30} value={stamps} onChange={(e) => setStamps(Number(e.target.value))} />
          ) : (
            earned > 0 && (
              <p className="text-sm text-gray-500">
                Ganará {points ? `${toPoints(earned, card)} ${card.points_name}` : formatMoney(earned, currency)}
              </p>
            )
          )}
          <Button type="submit" loading={busy} className="w-full">Registrar</Button>
        </form>
      </Panel>

      <Panel className="space-y-3">
        <p className="font-medium">Canjear</p>
        {card.kind === 'cashback' && (
          <Input
            label={points ? `${card.points_name} a canjear` : `Monto a canjear (${currency})`}
            inputMode="decimal"
            value={redeemValue}
            onChange={(e) => setRedeemValue(e.target.value)}
          />
        )}
        <Button
          variant="secondary"
          className="w-full"
          disabled={busy || (card.kind === 'stamps' && customer.rewards < 1)}
          onClick={redeemNow}
        >
          {card.kind === 'stamps' ? `Canjear: ${card.reward_name}` : 'Canjear saldo'}
        </Button>
      </Panel>

      <Button variant="ghost" className="w-full" onClick={onDone}>Escanear otro cliente</Button>
    </div>
  );
}
