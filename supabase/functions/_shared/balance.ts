// How a balance is shown. Pure TS shared by the Edge Functions (wallet
// passes) and the web app, so every surface prints the same thing.

export interface CardRules {
  kind: "stamps" | "cashback";
  stamps_goal: number | null;
  reward_name: string | null;
  cashback_percent: number | null;
  points_name: string | null;
  points_per_unit: number;
}

export interface Balance {
  stamps: number;
  rewards: number;
  cashback_balance: number;
}

export function formatMoney(amount: number, currency: string): string {
  return `${Number(amount).toFixed(2)} ${currency}`;
}

/** Cashback is stored as money; points are only a way to display it. */
export function toPoints(money: number, rules: CardRules): number {
  return Math.round(Number(money) * rules.points_per_unit);
}

export function usesPoints(rules: CardRules): boolean {
  return rules.kind === "cashback" && Boolean(rules.points_name);
}

/** Main number of the card: "3/10" stamps, "250" points or "2.50 USD". */
export function mainBalance(rules: CardRules, balance: Balance, currency: string) {
  if (rules.kind === "stamps") {
    return { label: "Sellos", value: `${balance.stamps}/${rules.stamps_goal}` };
  }
  if (usesPoints(rules)) {
    return { label: rules.points_name!, value: String(toPoints(balance.cashback_balance, rules)) };
  }
  return { label: "Saldo", value: formatMoney(balance.cashback_balance, currency) };
}

/** Second line: rewards ready to use, or how the cashback works. */
export function secondaryBalance(rules: CardRules, balance: Balance) {
  if (rules.kind === "stamps") {
    return { label: "Premios", value: String(balance.rewards) };
  }
  const percent = Number(rules.cashback_percent);
  if (usesPoints(rules)) {
    // e.g. 5% and 100 per unit → "5 por cada 1"
    const perUnit = Math.round(percent * rules.points_per_unit) / 100;
    return { label: "Ganas", value: `${perUnit} por cada 1` };
  }
  return { label: "Cashback", value: `${percent}%` };
}

/** One-line explanation for the card back / details. */
export function howItWorks(rules: CardRules, currency: string): string {
  if (rules.kind === "stamps") {
    return `Junta ${rules.stamps_goal} sellos y obtén: ${rules.reward_name}.`;
  }
  const percent = Number(rules.cashback_percent);
  if (usesPoints(rules)) {
    return `Recibes el ${percent}% de cada compra en ${rules.points_name}. ` +
      `${rules.points_per_unit} ${rules.points_name} = 1 ${currency}.`;
  }
  return `Recibes el ${percent}% de cada compra como saldo para tu próxima visita.`;
}
