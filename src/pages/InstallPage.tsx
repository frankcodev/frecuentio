import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PHONE_PREFIXES, toE164 } from '../lib/config';
import { parseBirthDate } from '../lib/birthDate';
import type { PublicCard } from '../lib/types';
import { howItWorks } from '../../supabase/functions/_shared/balance';
import { CardView } from '../components/CardView';
import { Alert, BirthDateInput, Button, FullPageSpinner, Input, Select } from '../components/ui';

/** Public page behind the business' link/QR: the customer signs up and gets the card. */
export default function InstallPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const [card, setCard] = useState<PublicCard | null | undefined>(undefined);
  const [form, setForm] = useState({ name: '', prefix: '+1', phone: '', birth: '', accept: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.rpc('public_card', { p_code: code }).then(({ data }) => setCard(data as PublicCard | null));
  }, [code]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const phone = toE164(form.prefix, form.phone);
    if (!phone) return setError('Revisa tu número de teléfono.');
    const birth = parseBirthDate(form.birth);
    if (birth === undefined) return setError('Revisa tu fecha de nacimiento (DD/MM/AAAA).');
    if (!form.accept) return setError('Debes aceptar los términos.');
    setLoading(true);
    setError('');
    const { data, error } = await supabase.rpc('install_card', {
      p_code: code,
      p_first_name: form.name,
      p_phone: phone,
      p_birth_date: birth,
    });
    setLoading(false);
    if (error) return setError('No pudimos crear tu tarjeta. Intenta de nuevo.');
    navigate(`/c/${data}`, { replace: true });
  }

  if (card === undefined) return <FullPageSpinner />;
  if (card === null) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <p className="text-gray-500">Esta tarjeta no existe o ya no acepta clientes nuevos.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6 px-4 py-8">
      <div className="flex justify-center"><CardView card={card} /></div>
      <p className="text-center text-sm text-gray-600">{howItWorks(card, card.currency)}</p>

      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-6 shadow-soft">
        <Input label="Nombre" name="name" autoComplete="given-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="grid grid-cols-[110px_1fr] gap-2">
          <Select label="País" value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })}>
            {PHONE_PREFIXES.map((p) => <option key={p.label} value={p.code}>{p.label}</option>)}
          </Select>
          <Input label="Teléfono" name="phone" type="tel" inputMode="tel" autoComplete="tel-national" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <BirthDateInput label="Fecha de nacimiento (opcional)" value={form.birth} onChange={(birth) => setForm({ ...form, birth })} />
        <label className="flex items-start gap-2 text-sm text-gray-600">
          <input type="checkbox" className="mt-1" checked={form.accept} onChange={(e) => setForm({ ...form, accept: e.target.checked })} />
          <span>Acepto los términos{card.terms ? `: ${card.terms}` : ''}</span>
        </label>
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full">Obtener mi tarjeta</Button>
        <p className="text-center text-xs text-gray-400">Si ya tenías una con este teléfono, recuperas tu saldo.</p>
      </form>
    </div>
  );
}
