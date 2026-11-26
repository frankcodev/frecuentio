import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ScanLine } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Transaction } from '../lib/types';
import { formatMoney } from '../../supabase/functions/_shared/balance';
import { Button, Panel } from '../components/ui';

const LABELS: Record<Transaction['kind'], string> = {
  install: 'Instaló la tarjeta',
  purchase: 'Compra',
  redeem: 'Canje',
};

export default function DashboardPage() {
  const { business, card } = useAuth();
  const [stats, setStats] = useState({ customers: 0, visits: 0, sales: 0, redeems: 0 });
  const [recent, setRecent] = useState<Transaction[]>([]);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }),
      supabase.from('transactions').select('kind, amount').gte('created_at', since).in('kind', ['purchase', 'redeem']),
      supabase
        .from('transactions')
        .select('*, customers(first_name)')
        .order('created_at', { ascending: false })
        .limit(10),
    ]).then(([customers, month, last]) => {
      const rows = (month.data ?? []) as Pick<Transaction, 'kind' | 'amount'>[];
      const purchases = rows.filter((r) => r.kind === 'purchase');
      setStats({
        customers: customers.count ?? 0,
        visits: purchases.length,
        sales: purchases.reduce((sum, r) => sum + Number(r.amount ?? 0), 0),
        redeems: rows.length - purchases.length,
      });
      setRecent((last.data ?? []) as Transaction[]);
    });
  }, []);

  const currency = business?.currency ?? 'USD';

  if (!card) {
    return (
      <Panel className="mx-auto max-w-md space-y-4 text-center">
        <h1 className="text-xl">Bienvenido 👋</h1>
        <p className="text-sm text-gray-500">Crea tu tarjeta de lealtad para empezar a sumar clientes.</p>
        <Link to="/tarjeta"><Button>Crear mi tarjeta <ArrowRight className="h-4 w-4" /></Button></Link>
      </Panel>
    );
  }

  const tiles = [
    { label: 'Clientes', value: stats.customers },
    { label: 'Visitas (30 días)', value: stats.visits },
    { label: 'Ventas (30 días)', value: formatMoney(stats.sales, currency) },
    { label: 'Canjes (30 días)', value: stats.redeems },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl">Inicio</h1>
        <Link to="/escanear"><Button><ScanLine className="h-4 w-4" /> Escanear</Button></Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {tiles.map((t) => (
          <Panel key={t.label} className="!p-5">
            <p className="text-xs text-gray-500">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">{t.value}</p>
          </Panel>
        ))}
      </div>

      <Panel>
        <h2 className="mb-4 text-base">Actividad reciente</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay movimientos.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium">{t.customers?.first_name ?? 'Cliente'}</p>
                  <p className="text-xs text-gray-500">{LABELS[t.kind]} · {new Date(t.created_at).toLocaleString('es')}</p>
                </div>
                <span className="text-gray-600">
                  {t.kind === 'purchase' && t.amount != null && formatMoney(t.amount, t.currency)}
                  {t.kind === 'redeem' && (t.amount != null ? `−${formatMoney(t.amount, t.currency)}` : 'Premio')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
