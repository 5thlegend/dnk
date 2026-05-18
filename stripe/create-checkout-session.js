// PLAY #1 — Cielito Lindo → Tulare County restaurant build
// $497 one-time. Single SKU. Stripe Checkout session creator.
//
// Drop into any Node runtime: Vercel/Netlify function, Express route, Cloudflare
// Worker (swap fetch for the stripe SDK), Bun.serve, etc.

const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
});

const PRICE_ID    = process.env.STRIPE_PRICE_ID;
const SUCCESS_URL = process.env.SUCCESS_URL || 'https://dnk.example/thank-you?session_id={CHECKOUT_SESSION_ID}';
const CANCEL_URL  = process.env.CANCEL_URL  || 'https://dnk.example/pricing?cancelled=1';

async function createSession(req) {
  const body = (req && req.body) || {};

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'link'],
    line_items: [{ price: PRICE_ID, quantity: 1 }],

    success_url: SUCCESS_URL,
    cancel_url:  CANCEL_URL,

    allow_promotion_codes: true,
    billing_address_collection: 'required',
    phone_number_collection: { enabled: true },
    customer_creation: 'always',

    custom_fields: [
      {
        key: 'restaurant_name',
        label: { type: 'custom', custom: 'Restaurant name' },
        type: 'text',
        text: { minimum_length: 2, maximum_length: 80 },
      },
      {
        key: 'restaurant_city',
        label: { type: 'custom', custom: 'City (Tulare County)' },
        type: 'dropdown',
        dropdown: {
          options: [
            { label: 'Visalia',       value: 'visalia' },
            { label: 'Tulare',        value: 'tulare' },
            { label: 'Porterville',   value: 'porterville' },
            { label: 'Hanford',       value: 'hanford' },
            { label: 'Dinuba',        value: 'dinuba' },
            { label: 'Lindsay',       value: 'lindsay' },
            { label: 'Exeter',        value: 'exeter' },
            { label: 'Farmersville',  value: 'farmersville' },
            { label: 'Other',         value: 'other' },
          ],
        },
      },
      {
        key: 'current_website',
        label: { type: 'custom', custom: 'Current website / FB page (optional)' },
        type: 'text',
        optional: true,
        text: { maximum_length: 200 },
      },
    ],

    consent_collection: { terms_of_service: 'required' },

    metadata: {
      play: 'PLAY-001',
      sku:  'cielito-lindo-tulare',
      region: 'TULARE_CA',
      theme: 'cielito-lindo',
      delivery_hours: '48',
      guarantee: '50_pct_back_if_late',
      source: body.source || 'pricing_page',
    },

    payment_intent_data: {
      statement_descriptor_suffix: 'PLAY-001',
      description: 'PLAY #1 — Cielito Lindo restaurant build (48h, Tulare CA)',
      metadata: {
        play: 'PLAY-001',
        sku:  'cielito-lindo-tulare',
      },
    },

    // Auto-expire abandoned sessions after 24h so the slot reopens.
    expires_at: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
  });

  return { id: session.id, url: session.url };
}

// ---- Express / Vercel / Netlify style handler ----
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end('Method Not Allowed');
  }

  try {
    const out = await createSession(req);
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = 200;
    return res.end(JSON.stringify(out));
  } catch (err) {
    console.error('[stripe] create-checkout-session failed:', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'checkout_session_failed' }));
  }
};

module.exports.createSession = createSession;
