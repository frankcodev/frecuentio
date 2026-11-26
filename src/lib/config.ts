// Product name shown in the panel. Customers only ever see the business' own name.
export const APP_NAME = 'Frecuentio';

export const CURRENCIES = ['USD', 'EUR', 'MXN', 'COP', 'ARS', 'CLP', 'PEN', 'VES', 'BRL', 'DOP', 'GTQ', 'CRC', 'UYU'];

export const PHONE_PREFIXES = [
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+52', label: '🇲🇽 +52' },
  { code: '+57', label: '🇨🇴 +57' },
  { code: '+58', label: '🇻🇪 +58' },
  { code: '+54', label: '🇦🇷 +54' },
  { code: '+56', label: '🇨🇱 +56' },
  { code: '+51', label: '🇵🇪 +51' },
  { code: '+593', label: '🇪🇨 +593' },
  { code: '+55', label: '🇧🇷 +55' },
  { code: '+507', label: '🇵🇦 +507' },
  { code: '+506', label: '🇨🇷 +506' },
  { code: '+598', label: '🇺🇾 +598' },
  { code: '+34', label: '🇪🇸 +34' },
];

/** Prefix + local digits → E.164, or null when it can't be a real number. */
export function toE164(prefix: string, local: string): string | null {
  const digits = local.replace(/\D/g, '').replace(/^0+/, '');
  const phone = `${prefix}${digits}`;
  return /^\+[1-9][0-9]{7,14}$/.test(phone) ? phone : null;
}
