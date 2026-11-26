/* Typed birth dates (DD/MM/AAAA): formatting while typing and conversion to
   the ISO date the backend stores. */

export function formatDateInput(text: string): string {
  // Browser autofill (autocomplete="bday") may hand us an ISO date
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text.trim());
  const digits = (iso ? `${iso[3]}${iso[2]}${iso[1]}` : text).replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Empty → null, a real date between 1900 and today → 'YYYY-MM-DD', anything else → undefined. */
export function parseBirthDate(text: string): string | null | undefined {
  if (!text.trim()) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return undefined;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  const exists =
    date.getUTCFullYear() === Number(yyyy) &&
    date.getUTCMonth() === Number(mm) - 1 &&
    date.getUTCDate() === Number(dd);
  if (!exists || Number(yyyy) < 1900 || date.getTime() > Date.now()) return undefined;
  return `${yyyy}-${mm}-${dd}`;
}
