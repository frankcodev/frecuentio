import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { functionUrl, supabase } from '../lib/supabase';
import type { CustomerCard } from '../lib/types';
import { howItWorks } from '../../supabase/functions/_shared/balance';
import { CardView } from '../components/CardView';
import { FullPageSpinner } from '../components/ui';

/** The customer's card on the web. The URL itself (token) is the credential: bookmark it. */
export default function WebCardPage() {
  const { token = '' } = useParams();
  const [card, setCard] = useState<CustomerCard | null | undefined>(undefined);

  useEffect(() => {
    const load = () =>
      supabase.rpc('customer_card', { p_token: token }).then(({ data, error }) => setCard(error ? null : (data as CustomerCard | null)));
    load();
    // Fresh balance when the customer comes back to the tab
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [token]);

  if (card === undefined) return <FullPageSpinner />;
  if (card === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-gray-500">No encontramos esta tarjeta. Si la recuperaste, usa el enlace nuevo.</p>
      </div>
    );
  }

  // Wallet buttons only when the project has the certificates set up (see README)
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const showApple = import.meta.env.VITE_APPLE_WALLET === 'true' && !isAndroid;
  const showGoogle = import.meta.env.VITE_GOOGLE_WALLET === 'true' && !isIos;

  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 py-8">
      <div className="flex justify-center">
        <CardView card={card} balance={card} holder={card.first_name} qr={card.token} />
      </div>
      <p className="text-center text-sm text-gray-600">{howItWorks(card, card.currency)}</p>

      <div className="space-y-2">
        {showApple && (
          <a href={`${functionUrl('apple-pass')}?token=${card.token}`} className="block rounded-xl bg-black px-4 py-3 text-center text-sm font-medium text-white">
            Agregar a Apple Wallet
          </a>
        )}
        {showGoogle && (
          <a href={`${functionUrl('google-pass')}?token=${card.token}`} className="block rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-medium">
            Agregar a Google Wallet
          </a>
        )}
        <p className="text-center text-xs text-gray-400">
          Muestra este QR al pagar. Guarda esta página en favoritos para volver a tu tarjeta.
        </p>
      </div>
    </div>
  );
}
