/**
 * Organizaciones ALIADAS verificadas de Nido (escaparate público).
 *
 * IMPORTANTE: solo entran organizaciones que el equipo de coordinación ha
 * verificado. No se inventan datos: nombre, teléfono y logo se toman de la fuente
 * oficial de cada aliado. Antes de añadir o revisar una entrada, reconfirma el
 * teléfono y el logo contra el aliado.
 *
 * Lista curada en código a propósito (no BBDD): hay pocos aliados y cambian rara
 * vez, igual que `resources.ts`. ponytail: si algún día son muchos o los gestiona
 * un tercero, mover a D1 + panel admin.
 */

export type Partner = {
  readonly id: string;
  readonly name: string;
  /** Lema breve del aliado (opcional). */
  readonly tagline?: string;
  /** Ruta al logo dentro de /public (recorte cuadrado, idealmente circular). */
  readonly logo: string;
  /** Teléfono de contacto en formato libre; se normaliza con `toIntlNumber`. */
  readonly phone?: string;
  /** Web del aliado (opcional). */
  readonly url?: string;
};

export const PARTNERS: readonly Partner[] = [
  {
    id: "guardianes-azules",
    name: "Guardianes Azules",
    tagline: "No estás solo. Aquí caminamos contigo.",
    logo: "/partners/guardianes-azules.png",
    phone: "+52 56 1823 4332",
  },
];
