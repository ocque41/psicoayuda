// Permisos y rutas ficticios: aislamiento del compositor, sin servidor real.
export async function ensureProChatToken() {
  return { ok: true };
}
export async function ensureProInboxToken() {
  return { ok: true };
}
export async function renewSeekerChatToken() {
  return { ok: true };
}
export async function markProfessionalChatRead() {
  return { ok: true };
}
export async function verifyConversationE2eeActor() {
  return { ok: true, expiresAt: Date.now() + 3600000 };
}
export async function reopenConversation() {
  return { ok: true };
}
export async function deleteConversation() {
  return { ok: true };
}
export async function restoreConversation() {
  return { ok: true };
}
export async function joinWaitlistFromChat() {
  return { ok: false };
}
