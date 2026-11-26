import { FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { APP_NAME } from '../lib/config';
import { AuthShell } from '../components/AuthShell';
import { Alert, Button, Input } from '../components/ui';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError('Correo o contraseña incorrectos.');
  }

  return (
    <AuthShell title="Inicia sesión" subtitle={`Entra al panel de ${APP_NAME}`}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Correo" type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Contraseña" type="password" name="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Alert kind="error">{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full">Entrar</Button>
      </form>
      <p className="mt-5 text-center text-sm text-gray-500">
        ¿No tienes cuenta? <Link to="/registro" className="font-medium text-primary">Regístrate</Link>
      </p>
    </AuthShell>
  );
}
