export const needCategories = [
  "ansiedad_panico",
  "duelo",
  "estres_agudo",
  "perdida_vivienda",
  "familia_ninos",
  "orientacion_general",
  "otro",
] as const;

export const urgencyLevels = ["baja", "media", "alta"] as const;
export const languages = ["es", "en", "other"] as const;

export const needLabels: Record<(typeof needCategories)[number], string> = {
  ansiedad_panico: "Ansiedad o pánico",
  duelo: "Duelo",
  estres_agudo: "Estrés agudo",
  perdida_vivienda: "Pérdida de vivienda",
  familia_ninos: "Familia o niños",
  orientacion_general: "Orientación general",
  otro: "Otro",
};

export const urgencyLabels: Record<(typeof urgencyLevels)[number], string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const languageLabels: Record<(typeof languages)[number], string> = {
  es: "Español",
  en: "Inglés",
  other: "Otro",
};
