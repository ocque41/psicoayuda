export type AdminSearchParams = {
  page?: string | string[];
  cuenta?: string | string[];
  estado?: string | string[];
  urgencia?: string | string[];
  q?: string | string[];
  contacto_estado?: string | string[];
  contacto_origen?: string | string[];
  contacto_motivo?: string | string[];
};

export function adminSearchValue(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : undefined;
}

export function normalizeAdminSearch(query: AdminSearchParams) {
  return {
    page: adminSearchValue(query.page),
    cuenta: adminSearchValue(query.cuenta),
    estado: adminSearchValue(query.estado),
    urgencia: adminSearchValue(query.urgencia),
    q: adminSearchValue(query.q),
    contacto_estado: adminSearchValue(query.contacto_estado),
    contacto_origen: adminSearchValue(query.contacto_origen),
    contacto_motivo: adminSearchValue(query.contacto_motivo),
  };
}

export function adminRequestPage(value: string | undefined) {
  if (!value || !/^[1-9]\d{0,4}$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= 10_000 ? page : 1;
}
