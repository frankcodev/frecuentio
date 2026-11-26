import type { Balance, CardRules } from '../../supabase/functions/_shared/balance';

export type { Balance, CardRules };

export interface Business {
  id: string;
  name: string;
  currency: string;
}

export interface Card extends CardRules {
  id: string;
  business_id: string;
  name: string;
  bg_color: string;
  text_color: string;
  logo_url: string | null;
  terms: string;
  install_code: string;
  active: boolean;
}

export interface Customer extends Balance {
  id: string;
  card_id: string;
  first_name: string;
  phone: string;
  birth_date: string | null;
  token: string;
  visits: number;
  last_visit_at: string | null;
  wallet: 'apple' | 'google' | 'web' | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  customer_id: string | null;
  kind: 'install' | 'purchase' | 'redeem';
  amount: number | null;
  stamps: number;
  cashback: number;
  currency: string;
  created_at: string;
  customers?: { first_name: string } | null;
}

/** What public_card / customer_card return (card design + rules + business). */
export interface PublicCard extends CardRules {
  business_name: string;
  currency: string;
  name: string;
  bg_color: string;
  text_color: string;
  logo_url: string | null;
  terms: string;
}

export interface CustomerCard extends PublicCard, Balance {
  first_name: string;
  token: string;
}
