import { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { formatDateInput, parseBirthDate } from '../lib/birthDate';

type Variant = 'primary' | 'secondary' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary/90 shadow-soft',
  secondary: 'bg-white text-ink border border-gray-200 hover:bg-gray-50',
  ghost: 'text-primary hover:bg-primary/5',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

export function Button({ variant = 'primary', loading, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium
        transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
        disabled:pointer-events-none disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

/** Text field with label. Password fields get a show/hide toggle. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, id, className = '', type, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  const isPassword = type === 'password';
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium">
          {label}
        </label>
      )}
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && revealed ? 'text' : type}
          className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm placeholder:text-gray-400 transition
            focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20
            ${error ? 'border-red-300' : 'border-gray-200'} ${isPassword ? 'pr-11' : ''} ${className}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-gray-400 hover:text-ink"
          >
            {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
});

/** Typed DD/MM/AAAA date with numeric keypad, instead of the native picker. */
export function BirthDateInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [touched, setTouched] = useState(false);
  const invalid = touched && parseBirthDate(value) === undefined;
  return (
    <Input
      label={label}
      name="birth_date"
      inputMode="numeric"
      autoComplete="bday"
      placeholder="DD/MM/AAAA"
      maxLength={10}
      value={value}
      onChange={(e) => onChange(formatDateInput(e.target.value))}
      onBlur={() => setTouched(true)}
      error={invalid ? 'Escríbela como DD/MM/AAAA' : undefined}
    />
  );
}

export function Select({
  label,
  children,
  ...rest
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium">{label}</span>
      <select
        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-6 shadow-soft ${className}`}>{children}</div>;
}

export function Alert({ kind, children }: { kind: 'error' | 'success' | 'info'; children: ReactNode }) {
  const styles = {
    error: 'bg-red-50 text-red-700',
    success: 'bg-emerald-50 text-emerald-700',
    info: 'bg-primary/5 text-primary',
  }[kind];
  return <div className={`rounded-xl px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Spinner className="h-8 w-8 text-gray-300" />
    </div>
  );
}
