import "server-only";

// Direcciones aprobadas para mostrarse públicamente. La variable de entorno
// puede cambiarlas sin mezclar esta lista con quienes autorizan /admin.
const defaultPublicEmails = ["ocquema@gmail.com", "martinezra02@gmail.com"];

function emailList(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function getPrivacyContactEmail() {
  return process.env.PRIVACY_CONTACT_EMAIL || getPublicContactEmails()[0];
}

export function getAbuseContactEmail() {
  return (
    process.env.ABUSE_CONTACT_EMAIL ||
    process.env.PRIVACY_CONTACT_EMAIL ||
    getPublicContactEmails()[0]
  );
}

/** Correos que la organización ha decidido publicar en /contacto. */
export function getPublicContactEmails() {
  const configured = emailList(process.env.PUBLIC_CONTACT_EMAILS);
  return configured.length ? configured : defaultPublicEmails;
}
