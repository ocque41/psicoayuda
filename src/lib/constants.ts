// Tipología / áreas de especialización del profesional (en lo que más destaca).
// Las mismas claves las usa quien pide ayuda para decir qué necesita; por eso
// hay dos juegos de etiquetas: `needLabels` (vista profesional / filtros del
// feed) y `needSeekerLabels` (lenguaje cálido para quien busca apoyo).
export const needCategories = [
  "infancia_adolescencia",
  "familia_pareja",
  "duelo",
  "ansiedad_depresion",
  "trauma_crisis",
  "adicciones",
  "autoestima",
  "orientacion_general",
  "otro",
] as const;

export const urgencyLevels = ["baja", "media", "alta"] as const;
export const languages = ["es", "en", "other"] as const;

// Etiquetas por ESPECIALIDAD: las ve el profesional al elegir sus áreas y se
// usan en los filtros y las tarjetas del feed público.
export const needLabels: Record<(typeof needCategories)[number], string> = {
  infancia_adolescencia: "Niñez y adolescencia",
  familia_pareja: "Familia y pareja",
  duelo: "Duelo y pérdidas",
  ansiedad_depresion: "Ansiedad y depresión",
  trauma_crisis: "Trauma y crisis",
  adicciones: "Adicciones",
  autoestima: "Autoestima y desarrollo personal",
  orientacion_general: "Acompañamiento general",
  otro: "Otro",
};

// Etiquetas cálidas para la persona que pide ayuda (mismas keys que needLabels).
// Preguntan por la persona, no por el dato, y dejan salidas de baja exposición.
export const needSeekerLabels: Record<(typeof needCategories)[number], string> =
  {
    infancia_adolescencia: "Algo que vive un niño, niña o adolescente",
    familia_pareja: "Algo con mi familia o mi pareja",
    duelo: "Un duelo o una pérdida",
    ansiedad_depresion: "Ansiedad, angustia o tristeza",
    trauma_crisis: "Pasé por algo muy fuerte",
    adicciones: "Consumo o adicciones",
    autoestima: "Autoestima o cómo me siento conmigo",
    orientacion_general: "No sé / solo necesito hablar",
    otro: "Prefiero no decirlo ahora",
  };

// Urgencia en lenguaje vivencial, no clínico: no obliga a autodiagnosticarse.
export const urgencyLabels: Record<(typeof urgencyLevels)[number], string> = {
  baja: "Puedo esperar unos días",
  media: "Me vendría bien pronto",
  alta: "Lo estoy pasando muy mal ahora",
};

export const languageLabels: Record<(typeof languages)[number], string> = {
  es: "Español",
  en: "Inglés",
  other: "Otro",
};
