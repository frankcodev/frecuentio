-- Business rules smoke test. Run against a local stack:
--   docker exec -i supabase_db_frecuentio psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/business_rules_test.sql
-- Everything runs inside a transaction that is rolled back.
BEGIN;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('00000000-0000-0000-0000-00000000000a', 'cafe@test.local', '{"business_name":"Café Test","currency":"USD"}'),
  ('00000000-0000-0000-0000-00000000000b', 'otro@test.local', '{"business_name":"Otro","currency":"MXN"}');

DO $$ BEGIN
  ASSERT (SELECT name FROM businesses WHERE id = '00000000-0000-0000-0000-00000000000a') = 'Café Test', 'signup trigger';
END $$;

INSERT INTO cards (business_id, kind, name, cashback_percent, points_name, install_code)
VALUES ('00000000-0000-0000-0000-00000000000a', 'cashback', 'Club', 5, 'Coins', 'cafe1');
INSERT INTO cards (business_id, kind, name, stamps_goal, reward_name, install_code)
VALUES ('00000000-0000-0000-0000-00000000000b', 'stamps', 'Sellos', 3, 'Taco gratis', 'otro1');

-- Public install (anon)
SET LOCAL ROLE anon;
SELECT set_config('my.t1', install_card('cafe1', 'Ana', '+584121234567')::text, true);
SELECT set_config('my.t2', install_card('otro1', 'Luis', '+5215512345678')::text, true);
DO $$ BEGIN
  ASSERT (public_card('cafe1') ->> 'kind') = 'cashback', 'public_card';
  ASSERT (customer_card(current_setting('my.t1')::uuid) ->> 'first_name') = 'Ana', 'customer_card';
  BEGIN
    PERFORM record_purchase(gen_random_uuid(), 10);
    RAISE EXCEPTION 'anon must not record purchases';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- Same phone again → same customer, new token (old link stops working)
SELECT set_config('my.t1b', install_card('cafe1', 'Ana', '+584121234567')::text, true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM customers WHERE card_id = (SELECT id FROM cards WHERE install_code = 'cafe1')) = 1, 'dedupe';
  ASSERT customer_card(current_setting('my.t1')::uuid) IS NULL, 'old token revoked';
END $$;

-- Business A: cashback
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
DO $$
DECLARE c customers; ana uuid; luis uuid;
BEGIN
  SELECT id INTO ana FROM customers WHERE first_name = 'Ana';
  ASSERT (SELECT count(*) FROM customers) = 1, 'RLS: only own customers';
  c := record_purchase(ana, 200);
  ASSERT c.cashback_balance = 10.00, '5% of 200 = 10';
  c := record_purchase(ana, 2.50);
  ASSERT c.cashback_balance = 10.13, 'rounded to the cent';
  c := redeem(ana, 10);
  ASSERT c.cashback_balance = 0.13, 'redeem money';
  BEGIN
    PERFORM redeem(ana, 5);
    RAISE EXCEPTION 'overdraw must fail';
  EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM = 'insufficient_balance', SQLERRM;
  END;
  SELECT id INTO luis FROM customers WHERE first_name = 'Luis'; -- invisible through RLS
  ASSERT luis IS NULL, 'RLS hides other business';
  ASSERT (SELECT visits FROM customers WHERE id = ana) = 2, 'visits';
END $$;

-- Business B tries to touch A's customer → not found
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
DO $$
DECLARE c customers; luis uuid;
BEGIN
  BEGIN
    PERFORM record_purchase((SELECT id FROM customers WHERE first_name = 'Ana' LIMIT 1), 10);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  SELECT id INTO luis FROM customers WHERE first_name = 'Luis';
  -- stamps: goal 3
  c := record_purchase(luis, 5, 2);
  ASSERT c.stamps = 2 AND c.rewards = 0, 'two stamps';
  c := record_purchase(luis, 5, 2);
  ASSERT c.stamps = 1 AND c.rewards = 1, 'reward unlocked, remainder kept';
  c := redeem(luis);
  ASSERT c.rewards = 0, 'reward used';
  BEGIN
    PERFORM redeem(luis);
    RAISE EXCEPTION 'no rewards must fail';
  EXCEPTION WHEN OTHERS THEN ASSERT SQLERRM = 'no_rewards', SQLERRM;
  END;
  ASSERT (SELECT count(*) FROM transactions) = 4, 'install + 2 purchases + redeem';
END $$;
RESET ROLE;

DO $$ BEGIN
  ASSERT (SELECT cashback_balance FROM customers WHERE first_name = 'Ana') = 0.13, 'B could not change A';
  -- kind is locked
  UPDATE cards SET kind = 'stamps' WHERE install_code = 'cafe1';
  ASSERT (SELECT kind FROM cards WHERE install_code = 'cafe1') = 'cashback', 'kind locked';
END $$;

SELECT 'ALL TESTS PASSED' AS result;
ROLLBACK;
