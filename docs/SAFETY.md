# Safety Notes

Nido is a connector. It is not a medical treatment platform and not an
emergency response system.

## Product boundaries

Do not add:

- Video calls.
- Ratings or reviews.
- AI therapist features.
- Complex matching or popularity ranking.
- Hardcoded emergency phone numbers without verification.
- Payment providers other than the Nido payments module (`src/lib/payments`).

## Payments (allowed, under rules)

Payments for services unrelated to the earthquake are allowed through
`src/lib/payments` only. Rules:

- Earthquake help is always free; never charge for it.
- Never condition free help on buying a paid package.
- Use Stripe hosted Checkout for packages (Nido never touches card data).
- A fixed platform fee per transaction; professionals receive the rest via
  Stripe Connect.
- No alternative gateways, no card data collection, no subscriptions.

## Chat

Private per-conversation chat exists (see `docs/CHAT_ARCHITECTURE.md`). Do not
turn it into public messaging: access is limited to the two parties of a
conversation, with per-conversation authorization and audit.

## Intake boundaries

The public help form should ask for the minimum needed data:

- Contact email.
- Preferred language.
- Need category.
- Urgency.
- Optional country, state, city, or browser location.
- Contact consent.

Do not ask for national ID, documents, full address, or long trauma stories.

## Professional boundaries

Professional contact details are for coordinator handoff. Do not expose private
phone numbers or notes publicly.

Only approved, accepting, remote professionals under capacity should be
suggested or assigned by default.
