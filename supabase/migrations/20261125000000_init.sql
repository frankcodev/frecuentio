/*
# Frecuentio — base schema

One business per auth user. A business has one loyalty card (stamps or
cashback); customers install it from a public link and get a secret `token`
that is both their web card URL and the QR the business scans.

Every write that touches balances goes through the RPCs at the bottom
(atomic, row-locked, owner-checked). The client never updates balances.
*/

-- ── Tables ──────────────────────────────────────────────────────────────

CREATE TABLE businesses (
  id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL DEFAULT '',
  currency   text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'), -- ISO 4217
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cards (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL UNIQUE REFERENCES businesses(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('stamps', 'cashback')),
  name             text NOT NULL,
  -- stamps: N stamps unlock one reward
  stamps_goal      integer CHECK (stamps_goal BETWEEN 1 AND 30),
  reward_name      text,
  -- cashback: % of every purchase goes to the balance (stored as money)
  cashback_percent numeric(5,2) CHECK (cashback_percent > 0 AND cashback_percent <= 100),
  -- optional: show the cashback balance as points (points = money × points_per_unit)
  points_name      text,
  points_per_unit  integer NOT NULL DEFAULT 100 CHECK (points_per_unit BETWEEN 1 AND 10000),
  bg_color         text NOT NULL DEFAULT '#4F46E5' CHECK (bg_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color       text NOT NULL DEFAULT '#FFFFFF' CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  logo_url         text,
  terms            text NOT NULL DEFAULT '',
  install_code     text NOT NULL UNIQUE DEFAULT substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT stamps_fields CHECK (kind <> 'stamps' OR (stamps_goal IS NOT NULL AND reward_name IS NOT NULL)),
  CONSTRAINT cashback_fields CHECK (kind <> 'cashback' OR cashback_percent IS NOT NULL)
);

CREATE TABLE customers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id      uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  card_id          uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  first_name       text NOT NULL,
  phone            text NOT NULL CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'), -- E.164
  birth_date       date,
  token            uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(), -- secret: web card URL + QR
  stamps           integer NOT NULL DEFAULT 0 CHECK (stamps >= 0),
  rewards          integer NOT NULL DEFAULT 0 CHECK (rewards >= 0),
  cashback_balance numeric(12,2) NOT NULL DEFAULT 0 CHECK (cashback_balance >= 0),
  visits           integer NOT NULL DEFAULT 0,
  last_visit_at    timestamptz,
  wallet           text CHECK (wallet IN ('apple', 'google', 'web')),
  updated_at       timestamptz NOT NULL DEFAULT now(), -- drives Apple Wallet refreshes
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, phone) -- one card per phone
);
CREATE INDEX customers_business_idx ON customers (business_id, created_at DESC);

CREATE TABLE transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  kind        text NOT NULL CHECK (kind IN ('install', 'purchase', 'redeem')),
  amount      numeric(12,2), -- purchase total, or cashback redeemed
  stamps      integer NOT NULL DEFAULT 0, -- stamps added (purchase) or used (redeem)
  cashback    numeric(12,2) NOT NULL DEFAULT 0, -- cashback earned (purchase)
  currency    text NOT NULL, -- snapshot of the business currency
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_business_idx ON transactions (business_id, created_at DESC);

-- Apple Wallet devices that asked for updates (PassKit web service). Service role only.
CREATE TABLE apple_registrations (
  device_id   text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  push_token  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, customer_id)
);

-- ── Row Level Security ──────────────────────────────────────────────────

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE apple_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_business_select ON businesses FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY own_business_update ON businesses FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY own_cards_all ON cards FOR ALL TO authenticated
  USING (business_id = auth.uid()) WITH CHECK (business_id = auth.uid());

-- Customers and transactions are read-only from the panel; writes go through the RPCs
CREATE POLICY own_customers_select ON customers FOR SELECT TO authenticated USING (business_id = auth.uid());
CREATE POLICY own_transactions_select ON transactions FOR SELECT TO authenticated USING (business_id = auth.uid());

-- The card kind defines how balances work; changing it would break installed cards
CREATE FUNCTION cards_lock_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.kind := OLD.kind;
  NEW.install_code := OLD.install_code;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cards_lock_kind BEFORE UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION cards_lock_kind();

-- Design changes must reach installed passes: bump every customer of the card
CREATE FUNCTION cards_touch_customers() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE customers SET updated_at = now() WHERE card_id = NEW.id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER cards_touch_customers AFTER UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION cards_touch_customers();

-- Sign-up creates the business row from the form metadata
CREATE FUNCTION handle_new_user() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO businesses (id, name, currency)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'business_name', ''),
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'currency', ''), 'USD')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Storage: public logos, each business writes only in its own folder ──

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('logos', 'logos', true, 2097152, ARRAY['image/png'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY logos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY logos_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY logos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'logos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── Business RPCs (panel / scanner, owner only) ─────────────────────────

/*
Registers a purchase and returns the updated customer.
- stamps:   adds p_stamps; every stamps_goal stamps become one reward.
- cashback: adds round(amount × percent / 100, 2) to the balance.
*/
CREATE FUNCTION record_purchase(p_customer_id uuid, p_amount numeric, p_stamps integer DEFAULT 1)
RETURNS customers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c customers;
  k cards;
  earned numeric(12,2) := 0;
  total integer;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO c FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND OR c.business_id <> auth.uid() THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  SELECT * INTO k FROM cards WHERE id = c.card_id;

  IF k.kind = 'stamps' THEN
    IF p_stamps IS NULL OR p_stamps < 1 OR p_stamps > 30 THEN RAISE EXCEPTION 'invalid_stamps'; END IF;
    total := c.stamps + p_stamps;
    c.rewards := c.rewards + total / k.stamps_goal;
    c.stamps := total % k.stamps_goal;
  ELSE
    earned := round(p_amount * k.cashback_percent / 100, 2);
    c.cashback_balance := c.cashback_balance + earned;
  END IF;

  UPDATE customers
  SET stamps = c.stamps, rewards = c.rewards, cashback_balance = c.cashback_balance,
      visits = visits + 1, last_visit_at = now(), updated_at = now()
  WHERE id = c.id
  RETURNING * INTO c;

  INSERT INTO transactions (business_id, customer_id, kind, amount, stamps, cashback, currency)
  SELECT c.business_id, c.id, 'purchase', round(p_amount, 2),
         CASE WHEN k.kind = 'stamps' THEN p_stamps ELSE 0 END, earned, b.currency
  FROM businesses b WHERE b.id = c.business_id;

  RETURN c;
END;
$$;

/*
Redeems and returns the updated customer.
- stamps:   uses one available reward (p_amount is ignored).
- cashback: subtracts p_amount (money) from the balance.
*/
CREATE FUNCTION redeem(p_customer_id uuid, p_amount numeric DEFAULT NULL)
RETURNS customers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c customers;
  k cards;
BEGIN
  SELECT * INTO c FROM customers WHERE id = p_customer_id FOR UPDATE;
  IF NOT FOUND OR c.business_id <> auth.uid() THEN RAISE EXCEPTION 'customer_not_found'; END IF;
  SELECT * INTO k FROM cards WHERE id = c.card_id;

  IF k.kind = 'stamps' THEN
    IF c.rewards < 1 THEN RAISE EXCEPTION 'no_rewards'; END IF;
    UPDATE customers SET rewards = rewards - 1, updated_at = now() WHERE id = c.id RETURNING * INTO c;
  ELSE
    IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
    IF round(p_amount, 2) > c.cashback_balance THEN RAISE EXCEPTION 'insufficient_balance'; END IF;
    UPDATE customers SET cashback_balance = cashback_balance - round(p_amount, 2), updated_at = now()
    WHERE id = c.id RETURNING * INTO c;
  END IF;

  INSERT INTO transactions (business_id, customer_id, kind, amount, stamps, currency)
  SELECT c.business_id, c.id, 'redeem',
         CASE WHEN k.kind = 'cashback' THEN round(p_amount, 2) END,
         CASE WHEN k.kind = 'stamps' THEN k.stamps_goal ELSE 0 END, b.currency
  FROM businesses b WHERE b.id = c.business_id;

  RETURN c;
END;
$$;

-- ── Public RPCs (install page and web card, no session) ─────────────────

-- Public fields of a card (design + rules). Internal helper, not exposed.
CREATE FUNCTION card_info(p_card_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'business_name', b.name, 'currency', b.currency,
    'kind', k.kind, 'name', k.name, 'stamps_goal', k.stamps_goal, 'reward_name', k.reward_name,
    'cashback_percent', k.cashback_percent, 'points_name', k.points_name,
    'points_per_unit', k.points_per_unit, 'bg_color', k.bg_color, 'text_color', k.text_color,
    'logo_url', k.logo_url, 'terms', k.terms
  )
  FROM cards k JOIN businesses b ON b.id = k.business_id
  WHERE k.id = p_card_id;
$$;

-- What the install page needs to render the card. Active cards only.
CREATE FUNCTION public_card(p_code text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT card_info(id) FROM cards WHERE install_code = p_code AND active;
$$;

/*
Creates the customer (or recovers the card of an existing phone) and returns
its token. Recovering issues a NEW token, so a previously shared link or QR
stops working.
*/
CREATE FUNCTION install_card(p_code text, p_first_name text, p_phone text, p_birth_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  k cards;
  cur text;
  existing_id uuid;
  new_token uuid := gen_random_uuid();
BEGIN
  SELECT * INTO k FROM cards WHERE install_code = p_code AND active;
  IF NOT FOUND THEN RAISE EXCEPTION 'card_not_found'; END IF;
  IF coalesce(trim(p_first_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  SELECT currency INTO cur FROM businesses WHERE id = k.business_id;

  SELECT id INTO existing_id FROM customers WHERE card_id = k.id AND phone = p_phone;
  IF existing_id IS NOT NULL THEN
    UPDATE customers SET token = new_token, updated_at = now() WHERE id = existing_id;
    RETURN new_token;
  END IF;

  INSERT INTO customers (business_id, card_id, first_name, phone, birth_date, token)
  VALUES (k.business_id, k.id, trim(p_first_name), p_phone, p_birth_date, new_token)
  RETURNING id INTO existing_id;

  INSERT INTO transactions (business_id, customer_id, kind, currency)
  VALUES (k.business_id, existing_id, 'install', cur);

  RETURN new_token;
END;
$$;

-- The web card: balance + design, looked up by the secret token. Works even
-- if the business paused new installs (active = false).
CREATE FUNCTION customer_card(p_token uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT card_info(c.card_id) || jsonb_build_object(
    'first_name', c.first_name, 'stamps', c.stamps, 'rewards', c.rewards,
    'cashback_balance', c.cashback_balance, 'token', c.token
  )
  FROM customers c
  WHERE c.token = p_token;
$$;

-- ── Grants ──────────────────────────────────────────────────────────────
-- Declared explicitly (local stacks don't add Supabase's defaults). Table
-- privileges are minimal; RLS above still decides which rows.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, UPDATE ON businesses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON cards TO authenticated;
GRANT SELECT ON customers, transactions TO authenticated;

REVOKE EXECUTE ON FUNCTION record_purchase(uuid, numeric, integer), redeem(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_purchase(uuid, numeric, integer), redeem(uuid, numeric) TO authenticated;

GRANT EXECUTE ON FUNCTION public_card(text), install_card(text, text, text, date), customer_card(uuid)
  TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION card_info(uuid), handle_new_user(), cards_touch_customers(), cards_lock_kind()
  FROM PUBLIC, anon, authenticated;
