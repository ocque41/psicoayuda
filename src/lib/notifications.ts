import "server-only";

export async function notifyAdminHelpRequest(_helpRequestId: string) {
  if (!process.env.NOTIFICATION_EMAIL) return;
  // Email provider is intentionally not wired in the MVP.
  // Configure this when a concrete provider is selected.
}

export async function notifyProfessionalAssignment(_professionalEmail: string) {
  if (!process.env.CONTACT_FROM_EMAIL) return;
  // Email provider is intentionally not wired in the MVP.
  // Configure this when a concrete provider is selected.
}
