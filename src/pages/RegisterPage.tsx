import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { CURRENCIES } from '../lib/config';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Input, Select } from '../components/ui';

export default function RegisterPage() {
  const [form, setForm] = useState({ businessName: '', currency: 'USD', email: '', password: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    setLoading(true);
    setError('');
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      // The DB trigger creates the business from this metadata
      options: { data: { business_name: form.businessName.trim(), currency: form.currency } },
    });
    setLoading(false);
    if (error) return setError(error.message.includes('registered') ? 'Ese correo ya tiene una cuenta.' : 'No se pudo crear la cuenta.');
    // With email confirmation on there is no session yet
    if (!data.session) setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="Revisa tu correo" subtitle="Te enviamos un enlace para confirmar tu cuenta.">
        <Link to="/login" className="block text-center text-sm font-medium text-primary">Volver a iniciar sesión</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crea tu cuenta" subtitle="Lanza tu tarjeta de lealtad en minutos">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Nombre del negocio" name="business" required value={form.businessName} onChange={set('businessName')} />
        <Select label="Moneda" value={form.currency} onChange={set('currency')}>
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Input label="Correo" type="email" name="email" autoComplete="email" required value={form.email} onChange={set('email')} />
        <Input label="Contraseña" type="password" name="password" autoComplete="new-password" required hint="Mínimo 8 caracteres" value={form.password} onChange={set('password')} />
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full">Crear cuenta</Button>
      </form>
      <p className="mt-5 text-center text-sm text-gray-500">
        ¿Ya tienes cuenta? <Link to="/login" className="font-medium text-primary">Inicia sesión</Link>
      </p>
    </AuthShell>
  );
}
