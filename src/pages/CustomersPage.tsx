import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Customer } from '../lib/types';
import { mainBalance } from '../../supabase/functions/_shared/balance';
import { Panel } from '../components/ui';

const WALLETS = { apple: 'Apple Wallet', google: 'Google Wallet', web: 'Web' } as const;

export default function CustomersPage() {
  const { business, card } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => setCustomers((data ?? []) as Customer[]));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? customers.filter((c) => c.first_name.toLowerCase().includes(q) || c.phone.includes(q)) : customers;
  }, [customers, query]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">Clientes <span className="text-gray-400">{customers.length}</span></h1>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-3.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      <Panel className="!p-0">
        {filtered.length === 0 ? (
          <p className="p-6 text-sm text-gray-500">Sin clientes todavía. Comparte el enlace de tu tarjeta.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-4 px-6 py-4 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.first_name}</p>
                  <p className="text-xs text-gray-500">
                    {c.phone} · {c.visits} visitas{c.wallet ? ` · ${WALLETS[c.wallet]}` : ''}
                  </p>
                </div>
                {card && business && (
                  <span className="shrink-0 font-medium">{mainBalance(card, c, business.currency).value}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
