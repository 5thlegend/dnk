# PLAY #1 — Cielito Lindo → Tulare County Restaurant Build

Single-close offer kit. Target price: **$497 / close · 1 close = $497**.

```
play          PLAY-001
theme         Cielito Lindo (Shopify)
region        Tulare County, CA
sku           cielito-lindo-tulare
delivery      48 hours from asset handoff
guarantee     50% back if late, customer keeps the build
```

## Files

| File | Purpose |
|---|---|
| `pricing.html` | Single-file pricing page. Tailwind via CDN, JetBrains Mono + Inter, HUD brackets, scanline veil, operator-console feel. Pain → Promise → Proof → Package → Price. |
| `thank-you.html` | Post-payment landing page with terminal-style status, next-3-steps, 48h timeline, guarantee. |
| `stripe/config.md` | Stripe Product/Price/Payment Link/Webhook setup + env vars + test cards. |
| `stripe/create-checkout-session.js` | Node handler for `POST /api/create-checkout-session` with custom fields, metadata, and 24h expiry. |
| `emails/receipt.html` | Branded HTML receipt email (table-based, dark-mode safe, mobile-stacked). |
| `emails/recovery.html` | Failed-payment recovery email — slot-held framing, retry CTA, decline-reason guidance, ACH alt. |

## Stripe wiring (TL;DR)

1. Create the product + $497 one-time price in Stripe Dashboard (`stripe/config.md`).
2. Set env vars: `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_PAYMENT_LINK`, `STRIPE_WEBHOOK_SECRET`.
3. Replace the three `REPLACE_ME` constants in `pricing.html` (publishable key, price id, payment-link URL).
4. Deploy `stripe/create-checkout-session.js` to `/api/create-checkout-session`.
5. Add a webhook → `/api/stripe-webhook` for `checkout.session.completed`, `payment_intent.payment_failed`, `charge.refunded`.

The pricing page tries the server-side session first and falls back to the Payment Link if the endpoint is down — so the CTA never breaks even if you only ship the link.

## Template variables (emails)

Receipt: `{{customer_first_name}}`, `{{restaurant_name}}`, `{{restaurant_city}}`, `{{order_ref}}`, `{{payment_method}}`, `{{paid_at}}`, `{{handoff_form_url}}`, `{{kickoff_url}}`, `{{operator_name}}`, `{{receipt_url}}`.

Recovery: `{{customer_first_name}}`, `{{restaurant_name}}`, `{{order_ref}}`, `{{decline_code}}`, `{{decline_reason}}`, `{{hold_until}}`, `{{hold_remaining}}`, `{{retry_url}}`, `{{attempted_at}}`.

## Local preview

Open `pricing.html` directly in a browser — it's fully self-contained (Tailwind CDN + Stripe.js CDN). For Stripe Checkout to actually fire you need the env vars wired and the API route deployed.
