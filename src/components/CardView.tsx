import { mainBalance, secondaryBalance } from '../../supabase/functions/_shared/balance';
import type { Balance, PublicCard } from '../lib/types';
import { Qr } from './Qr';

const EMPTY: Balance = { stamps: 0, rewards: 0, cashback_balance: 0 };

/** The card as the customer sees it (web card, install page and panel preview). */
export function CardView({
  card,
  balance = EMPTY,
  holder,
  qr,
}: {
  card: PublicCard;
  balance?: Balance;
  holder?: string;
  qr?: string;
}) {
  const main = mainBalance(card, balance, card.currency);
  const second = secondaryBalance(card, balance);
  return (
    <div
      className="w-full max-w-sm overflow-hidden rounded-3xl p-5 shadow-soft"
      style={{ background: card.bg_color, color: card.text_color }}
    >
      <div className="flex items-center gap-3">
        {card.logo_url ? (
          <img src={card.logo_url} alt="" className="h-10 w-10 rounded-xl bg-white/20 object-contain" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 font-semibold">
            {(card.business_name || card.name).slice(0, 1).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate font-semibold">{card.business_name || 'Tu negocio'}</p>
          <p className="truncate text-sm opacity-80">{card.name || 'Nombre de la tarjeta'}</p>
        </div>
      </div>

      {card.kind === 'stamps' && card.stamps_goal ? (
        <div className="mt-6 grid grid-cols-5 gap-2">
          {Array.from({ length: card.stamps_goal }, (_, i) => (
            <span
              key={i}
              className="aspect-square rounded-full border-2"
              style={{
                borderColor: card.text_color,
                background: i < balance.stamps ? card.text_color : 'transparent',
                opacity: i < balance.stamps ? 1 : 0.5,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-70">{main.label}</p>
          <p className="text-3xl font-semibold tracking-tight">{main.value}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide opacity-70">{second.label}</p>
          <p className="text-lg font-medium">{second.value}</p>
        </div>
      </div>

      {(holder || qr) && (
        <div className="mt-6 flex flex-col items-center gap-2 rounded-2xl bg-white p-4 text-ink">
          {qr && <Qr value={qr} />}
          {holder && <p className="text-sm font-medium">{holder}</p>}
        </div>
      )}
    </div>
  );
}
