# Frecuentio

Tarjetas de lealtad digitales para negocios: **sellos** o **cashback** (con opción de mostrarlo como puntos), en la web, Apple Wallet y Google Wallet.

Una versión base, simple y fácil de leer: React + Vite + Tailwind en el frontend y Supabase (Postgres, Auth, Storage y Edge Functions) en el backend.

## Cómo funciona

1. El negocio se registra y crea su tarjeta: sellos (junta N y gana un premio) o cashback (un % de cada compra vuelve como saldo).
2. Comparte su enlace o QR (`/t/<código>`). El cliente pone nombre y teléfono y recibe su tarjeta (`/c/<token>`), con la opción de guardarla en Apple o Google Wallet.
3. En caja, el negocio escanea el QR del cliente desde **Escanear**, registra la compra con su monto y canjea premios o saldo.
4. El panel muestra clientes, visitas, ventas y canjes de los últimos 30 días.

### Cashback mostrado como puntos

El saldo siempre se guarda en dinero. Si la tarjeta tiene un nombre de puntos, se muestra como `puntos = saldo × puntos por unidad`.
Con 5 % y 100 puntos por unidad, el cliente gana 5 puntos por cada 1 de moneda y 100 puntos valen 1.

## Estructura

```
src/
  pages/          Login, registro, inicio, tarjeta, clientes, escáner y páginas públicas
  components/     UI básica, vista de la tarjeta, QR, layout
  lib/            Cliente de Supabase, sesión, acciones del escáner, tipos
supabase/
  migrations/     Esquema completo: tablas, RLS, RPC de compra/canje e instalación
  functions/      Apple Wallet (.pkpass + web service), Google Wallet y sincronización
  tests/          Prueba de reglas de negocio en SQL
```

Toda la lógica de saldos vive en funciones SQL atómicas (`record_purchase`, `redeem`, `install_card`), con RLS en todas las tablas: cada negocio solo ve y modifica a sus clientes.

## Correr en local

Requisitos: Node 20+, Docker y la [CLI de Supabase](https://supabase.com/docs/guides/cli).

```bash
npm install
supabase start                 # levanta Postgres, Auth y Storage y aplica la migración
cp .env.example .env           # pega la URL y la anon key que imprime `supabase status`
npm run dev
```

Opcional, para las Edge Functions: `supabase functions serve`.

Prueba de reglas de negocio:

```bash
docker exec -i supabase_db_frecuentio-base psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/business_rules_test.sql
```

## Desplegar

1. Crea un proyecto en Supabase, vincúlalo y aplica el esquema:
   ```bash
   supabase link --project-ref <tu-proyecto>
   supabase db push
   supabase functions deploy
   ```
2. En **Authentication → URL Configuration** pon la URL de tu frontend.
3. Despliega el frontend (Vercel, Netlify, etc.) con `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. `vercel.json` ya incluye el rewrite para las rutas.

## Wallets (opcional)

Sin estos secrets todo funciona con la tarjeta web y los botones de wallet no aparecen.

**Apple Wallet** (necesita una cuenta de Apple Developer y un Pass Type ID):

```bash
supabase secrets set PASS_SECRET=<texto aleatorio largo> \
  APPLE_PASS_TYPE_ID=pass.com.tuempresa.lealtad APPLE_TEAM_ID=<team id> \
  APPLE_CERT_P12_BASE64=<.p12 del Pass Type ID en base64> APPLE_CERT_PASSWORD=<clave del .p12> \
  APPLE_APNS_KEY_P8_BASE64=<llave .p8 en base64> APPLE_APNS_KEY_ID=<key id>
```

**Google Wallet** (necesita una cuenta de emisor en Google Pay & Wallet Console y una service account):

```bash
supabase secrets set GOOGLE_ISSUER_ID=<issuer id> GOOGLE_SERVICE_ACCOUNT_JSON="$(cat service-account.json)"
```

Después activa los botones en el frontend con `VITE_APPLE_WALLET=true` y/o `VITE_GOOGLE_WALLET=true`.

Cada compra o canje llama a `wallet-sync`, que avisa a los iPhone (push de APNs) y actualiza el pase de Google con el saldo nuevo.

## Limitaciones conocidas

- **Una tarjeta por negocio.** El tipo (sellos o cashback) no se puede cambiar después de crearla.
- **Recuperar una tarjeta solo pide el teléfono.** Si alguien registra un teléfono que ya existe, recibe esa misma tarjeta con un enlace nuevo y el anterior deja de funcionar. Para producción conviene verificar el teléfono con un código por SMS o WhatsApp.
- **Sin modo offline en el escáner** ni usuarios de caja separados: se escanea con la cuenta del negocio.

## Personalizar

- **Nombre del producto:** `src/lib/config.ts`.
- **Color de acento del panel:** `--color-primary` en `src/index.css`.
- **Colores y logo de cada tarjeta:** los elige el negocio desde el panel.
