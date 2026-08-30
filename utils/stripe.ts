import Stripe from "stripe";

// Instantiation is deferred until the first property access.
//
// This used to throw at module load. That works locally, but breaks a container
// build: Next's "collect page data" step imports app/api/webhooks/stripe/route.ts
// at BUILD time, so a missing key failed `next build` outright. The alternative
// — passing STRIPE_SECRET_KEY as a Docker build ARG — would bake a live secret
// into an image layer, which is worse.
//
// Deferring keeps the build key-free while preserving the loud runtime failure:
// the error now fires on the first actual Stripe call instead of at import.
// Mirrors the lazy pattern in utils/email.ts.
let client: Stripe | null = null;

function getStripe(): Stripe {
  if (!client) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        "Missing STRIPE_SECRET_KEY. Add it to .env.local (find it in the Stripe dashboard → Developers → API keys)."
      );
    }
    // No explicit apiVersion — uses the SDK's pinned default (see
    // node_modules/stripe/cjs/apiVersion.js) so it stays correct across upgrades.
    client = new Stripe(secretKey);
  }
  return client;
}

// Proxy so existing call sites keep using `stripe.checkout.sessions.create(...)`
// unchanged; only the timing of construction moves.
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});
