/// <reference types="@cloudflare/workers-types" />

declare global {
  interface CloudflareEnv {
    DB?: D1Database;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    ADMIN_EMAILS?: string;
    ABUSE_CONTACT_EMAIL?: string;
    PRIVACY_CONTACT_EMAIL?: string;
    PUBLIC_CONTACT_EMAILS?: string;
    CONTACT_FROM_EMAIL?: string;
    NOTIFICATION_EMAIL?: string;
    RESEND_API_KEY?: string;
    // Cloudflare Turnstile (anti-abuso en los formularios de credenciales).
    // El site key es público; el secreto vive como secreto del Worker.
    TURNSTILE_SITE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    // Stripe (cobros con Connect). La clave y el secreto del webhook viven como
    // secretos del Worker; la comisión fija de Nido es una var (céntimos).
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    NIDO_PLATFORM_FEE_CENTS?: string;
  }
}

export {};
