import "server-only";

const fallbackEmail = "contacto@psicoayuda.example";

export function getPrivacyContactEmail() {
  return process.env.PRIVACY_CONTACT_EMAIL || fallbackEmail;
}

export function getAbuseContactEmail() {
  return (
    process.env.ABUSE_CONTACT_EMAIL ||
    process.env.PRIVACY_CONTACT_EMAIL ||
    fallbackEmail
  );
}
