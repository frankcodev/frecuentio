import { supabase } from './supabase';
import type { Customer } from './types';

const ERRORS: Record<string, string> = {
  invalid_amount: 'Escribe un monto válido.',
  invalid_stamps: 'La cantidad de sellos no es válida.',
  customer_not_found: 'Cliente no encontrado.',
  no_rewards: 'Este cliente no tiene premios disponibles.',
  insufficient_balance: 'El cliente no tiene saldo suficiente.',
};

function message(error: { message: string }): string {
  const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
  return key ? ERRORS[key] : 'Algo salió mal. Intenta de nuevo.';
}

// Wallet passes refresh in the background; the scanner never waits for it
function syncWallets(customerId: string) {
  supabase.functions.invoke('wallet-sync', { body: { customer_id: customerId } }).catch(() => {});
}

export async function recordPurchase(customerId: string, amount: number, stamps = 1): Promise<Customer> {
  const { data, error } = await supabase.rpc('record_purchase', {
    p_customer_id: customerId,
    p_amount: amount,
    p_stamps: stamps,
  });
  if (error) throw new Error(message(error));
  syncWallets(customerId);
  return data as Customer;
}

export async function redeem(customerId: string, amount?: number): Promise<Customer> {
  const { data, error } = await supabase.rpc('redeem', { p_customer_id: customerId, p_amount: amount ?? null });
  if (error) throw new Error(message(error));
  syncWallets(customerId);
  return data as Customer;
}
