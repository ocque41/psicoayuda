/// <reference types="@cloudflare/workers-types" />

declare global {
  interface CloudflareEnv {
    DB?: D1Database;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    ADMIN_EMAILS?: string;
    CONTACT_FROM_EMAIL?: string;
    NOTIFICATION_EMAIL?: string;
  }
}

export {};
