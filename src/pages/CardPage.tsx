import { FormEvent, useEffect, useState } from 'react';
import { Copy, Upload } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import type { Card, PublicCard } from '../lib/types';
import { CardView } from '../components/CardView';
import { Qr } from '../components/Qr';
import { Alert, Button, Input, Panel } from '../components/ui';

type Draft = Omit<Card, 'id' | 'business_id' | 'install_code'>;

const NEW_CARD: Draft = {
  kind: 'cashback',
  name: '',
  stamps_goal: 10,
  reward_name: '',
  cashback_percent: 5,
  points_name: '',
  points_per_unit: 100,
  bg_color: '#4F46E5',
  text_color: '#FFFFFF',
  logo_url: null,
  terms: '',
  active: true,
};

export default function CardPage() {
  const { business, card, refresh } = useAuth();
  const [draft, setDraft] = useState<Draft>(card ?? NEW_CARD);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    if (card) setDraft(card);
  }, [card]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const isStamps = draft.kind === 'stamps';
  const installUrl = card ? `${window.location.origin}/t/${card.install_code}` : '';

  async function uploadLogo(file: File) {
    if (!business) return;
    if (file.type !== 'image/png') return setMessage({ kind: 'error', text: 'El logo debe ser PNG (ideal cuadrado, 512×512).' });
    const path = `${business.id}/logo-${Date.now()}.png`;
    const { error } = await supabase.storage.from('logos').upload(path, file, { contentType: 'image/png' });
    if (error) return setMessage({ kind: 'error', text: 'No se pudo subir el logo (máx. 2 MB).' });
    set('logo_url', supabase.storage.from('logos').getPublicUrl(path).data.publicUrl);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!business) return;
    setSaving(true);
    setMessage(null);
    // Only the fields of the chosen kind are stored; the DB checks the rest
    const row = {
      ...draft,
      business_id: business.id,
      name: draft.name.trim(),
      stamps_goal: isStamps ? draft.stamps_goal : null,
      reward_name: isStamps ? draft.reward_name?.trim() : null,
      cashback_percent: isStamps ? null : draft.cashback_percent,
      points_name: !isStamps && draft.points_name?.trim() ? draft.points_name.trim() : null,
    };
    const { error } = card
      ? await supabase.from('cards').update(row).eq('id', card.id)
      : await supabase.from('cards').insert(row);
    setSaving(false);
    if (error) return setMessage({ kind: 'error', text: 'Revisa los campos de la tarjeta.' });
    await refresh();
    setMessage({ kind: 'success', text: card ? 'Cambios guardados. Las tarjetas instaladas se actualizan solas.' : '¡Tarjeta creada! Comparte el enlace con tus clientes.' });
  }

  const preview: PublicCard = {
    ...draft,
    business_name: business?.name ?? '',
    currency: business?.currency ?? 'USD',
    points_name: draft.points_name || null,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl">{card ? 'Tu tarjeta' : 'Crea tu tarjeta'}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <form onSubmit={save} className="space-y-6">
          <Panel className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Tipo de programa</p>
              <div className="grid grid-cols-2 gap-2">
                {(['cashback', 'stamps'] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    disabled={Boolean(card)}
                    onClick={() => set('kind', k)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-not-allowed ${
                      draft.kind === k ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200'
                    }`}
                  >
                    <span className="block font-medium">{k === 'cashback' ? 'Cashback' : 'Sellos'}</span>
                    <span className="text-xs text-gray-500">
                      {k === 'cashback' ? 'Un % de cada compra vuelve como saldo' : 'Junta N sellos y gana un premio'}
                    </span>
                  </button>
                ))}
              </div>
              {card && <p className="mt-2 text-xs text-gray-500">El tipo no se puede cambiar después de crear la tarjeta.</p>}
            </div>

            <Input label="Nombre de la tarjeta" required placeholder="Club de clientes" value={draft.name} onChange={(e) => set('name', e.target.value)} />

            {isStamps ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Sellos para el premio" type="number" min={1} max={30} required value={draft.stamps_goal ?? ''} onChange={(e) => set('stamps_goal', Number(e.target.value))} />
                <Input label="Premio" required placeholder="Un café gratis" value={draft.reward_name ?? ''} onChange={(e) => set('reward_name', e.target.value)} />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Input label="Cashback (%)" type="number" step="0.01" min={0.01} max={100} required value={draft.cashback_percent ?? ''} onChange={(e) => set('cashback_percent', Number(e.target.value))} />
                <Input label="Nombre de los puntos" placeholder="Opcional: Coins" hint="Vacío = se muestra en dinero" value={draft.points_name ?? ''} onChange={(e) => set('points_name', e.target.value)} />
                <Input label="Puntos por 1 de moneda" type="number" min={1} max={10000} disabled={!draft.points_name} value={draft.points_per_unit} onChange={(e) => set('points_per_unit', Number(e.target.value))} />
              </div>
            )}
          </Panel>

          <Panel className="space-y-4">
            <p className="text-sm font-medium">Diseño</p>
            <div className="grid grid-cols-2 gap-4">
              <label className="space-y-1.5 text-sm">
                <span className="block font-medium">Fondo</span>
                <input type="color" value={draft.bg_color} onChange={(e) => set('bg_color', e.target.value.toUpperCase())} className="h-10 w-full cursor-pointer rounded-xl border border-gray-200" />
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="block font-medium">Texto</span>
                <input type="color" value={draft.text_color} onChange={(e) => set('text_color', e.target.value.toUpperCase())} className="h-10 w-full cursor-pointer rounded-xl border border-gray-200" />
              </label>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-primary">
              <Upload className="h-4 w-4" /> {draft.logo_url ? 'Cambiar logo' : 'Subir logo (PNG)'}
              <input type="file" accept="image/png" className="hidden" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            </label>
            <label className="block space-y-1.5 text-sm">
              <span className="block font-medium">Términos y condiciones</span>
              <textarea rows={3} value={draft.terms} onChange={(e) => set('terms', e.target.value)} className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </label>
            {card && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active} onChange={(e) => set('active', e.target.checked)} />
                Aceptar clientes nuevos
              </label>
            )}
          </Panel>

          {message && <Alert kind={message.kind}>{message.text}</Alert>}
          <Button type="submit" loading={saving}>{card ? 'Guardar cambios' : 'Crear tarjeta'}</Button>
        </form>

        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <div className="flex justify-center">
            <CardView card={preview} holder="Vista previa" />
          </div>
          {card && (
            <Panel className="space-y-3 text-center">
              <p className="text-sm font-medium">Enlace para tus clientes</p>
              <div className="flex justify-center"><Qr value={installUrl} size={160} /></div>
              <p className="break-all text-xs text-gray-500">{installUrl}</p>
              <Button variant="secondary" onClick={() => navigator.clipboard.writeText(installUrl)}>
                <Copy className="h-4 w-4" /> Copiar enlace
              </Button>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
