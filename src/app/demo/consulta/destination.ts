/** Los fragmentos de los favoritos antiguos sólo llegan al navegador.
 * Destinos cerrados: nunca trasladar identificadores ficticios a una ficha real. */
export function practiceEntryDestination(hash: string) {
  const section = hash.replace(/^#(?:demo-)?/, "");
  if (section === "pacientes" || section === "notas") return "/pro/pacientes";
  if (section === "mensajes" || section === "chats") return "/pro/mensajes";
  if (section === "cobros") return "/pro/cobros";
  if (section === "ajustes" || section.startsWith("recordatorios"))
    return "/pro/ajustes#reminders-professional";
  return "/pro/consulta";
}
