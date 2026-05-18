# Stripe — PLAY #1 Checkout Configuration

Operator-console build for Cielito Lindo → Tulare County restaurants.
Target: **$497 USD, one-time, single SKU.**

---

## 1. Product + Price (Dashboard)

**Stripe Dashboard → Products → + Add product**

| Field | Value |
|---|---|
| Name | `PLAY #1 — Cielito Lindo Restaurant Build` |
| Description | `48-hour Shopify restaurant build on Cielito Lindo theme. Includes setup, menu, mobile tuning, GBP sync, 30-day post-launch revisions, and Google Ads creative pack bonus.` |
| Image | Upload hero image (1024×1024 PNG) |
| Price | `$497.00 USD` |
| Billing | **One-time** |
| Tax behavior | Inclusive / Exclusive per your nexus |
| Statement descriptor | `DNK PLAY-001` (≤22 chars) |
| Lookup key | `play_001_cielito_lindo_497` |
| Metadata | `play=PLAY-001`, `region=TULARE_CA`, `theme=cielito-lindo`, `delivery_hours=48` |

Copy the resulting `price_xxx` ID into the env var `STRIPE_PRICE_ID`.

---

## 2. Option A — Payment Link (no server)

**Dashboard → Payment Links → + New**

- Product: `PLAY #1 — Cielito Lindo Restaurant Build` × 1, **not adjustable**
- Collect customer info: **email, phone, billing address, shipping address OFF**
- Custom fields:
  - `restaurant_name` (text, required)
  - `restaurant_city` (text, required, hint: "Visalia / Tulare / Porterville / Hanford / Dinuba / other")
  - `current_website` (text, optional)
  - `menu_link_or_upload` (text, optional)
- After payment: **Redirect → `https://dnk.example/thank-you?session_id={CHECKOUT_SESSION_ID}`**
- Confirmation email: **On** (Stripe-hosted receipt — we also send our branded receipt via webhook)
- Allow promotion codes: **On** (we run `OPS10` / `EARLYBIRD` occasionally)
- Limit number of payments: **leave unlimited** (manage slots via webhook)

Copy the link URL into `STRIPE_PAYMENT_LINK` (used as JS fallback in `pricing.html`).

Example: `https://buy.stripe.com/9AQ_REPLACE_ME`

---

## 3. Option B — Checkout Session via API (preferred)

Server endpoint: `POST /api/create-checkout-session` — see `stripe/create-checkout-session.js`.

Frontend `pricing.html` calls this endpoint first, falls back to the Payment Link if it 5xxs.

---

## 4. Webhooks

**Dashboard → Developers → Webhooks → + Add endpoint**

- Endpoint URL: `https://dnk.example/api/stripe-webhook`
- Events:
  - `checkout.session.completed` → trigger build queue + receipt email (`emails/receipt.html`)
  - `payment_intent.payment_failed` → trigger recovery email (`emails/recovery.html`)
  - `charge.refunded` → mark order refunded, notify ops
- Signing secret → `STRIPE_WEBHOOK_SECRET`

---

## 5. Environment variables

```env
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PRICE_ID=price_...
STRIPE_PAYMENT_LINK=https://buy.stripe.com/...
STRIPE_WEBHOOK_SECRET=whsec_...
SUCCESS_URL=https://dnk.example/thank-you?session_id={CHECKOUT_SESSION_ID}
CANCEL_URL=https://dnk.example/pricing?cancelled=1
```

---

## 6. Test cards

| Scenario | Card |
|---|---|
| Success | `4242 4242 4242 4242` |
| Auth required (3DS) | `4000 0027 6000 3184` |
| Decline → recovery flow | `4000 0000 0000 9995` |
