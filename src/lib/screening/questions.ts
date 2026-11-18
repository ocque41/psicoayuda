/**
 * Cuestionario clínico de admisión (versión 2026-11). Fuente única de las
 * preguntas, las respuestas correctas y el peso de cada una.
 *
 * Solo se importa en el servidor: la respuesta correcta nunca viaja al
 * navegador. Las opciones se identifican con un slug estable (no con letras) y
 * se barajan por candidato, porque en el original la opción correcta era
 * siempre la b).
 */
export const SCREENING_VERSION = "2026-11-v1";

export type ScreeningOption = { id: string; label: string };
type Base = { id: string; block: ScreeningBlockId; title: string };
export type InfoQuestion = Base & {
  kind: "single" | "multi";
  scoring: "info";
  options: ScreeningOption[];
  /** Opción que excluye a las demás (p. ej. «Ninguna de estas»). */
  exclusive?: string;
};
export type ScoredQuestion = Base & {
  kind: "single";
  scoring: "scored";
  options: ScreeningOption[];
  correct: string;
  weight: number;
  /**
   * always: eliminatoria siempre. children / older: eliminatoria solo si el
   * candidato declara trabajar con infancia o con adultos mayores.
   */
  eliminatory?: "always" | "children" | "older";
};
export type TextQuestion = Base & {
  kind: "text";
  scoring: "info";
  minLength: number;
  maxLength: number;
};
export type ScreeningQuestion = InfoQuestion | ScoredQuestion | TextQuestion;
export type ScreeningBlockId = "A" | "B" | "C" | "D" | "E";

export const SCREENING_BLOCKS: Record<ScreeningBlockId, string> = {
  A: "Tu especialidad",
  B: "Competencia clínica general",
  C: "Competencia por especialidad",
  D: "Trauma y situaciones de crisis",
  E: "Tus límites de atención",
};

export const SCREENING_QUESTIONS: ScreeningQuestion[] = [
  {
    id: "q1",
    block: "A",
    kind: "multi",
    scoring: "info",
    title: "¿Cuál es tu área principal de trabajo?",
    options: [
      { id: "ansiedad", label: "Ansiedad, depresión y estrés" },
      { id: "infancia", label: "Infancia y adolescencia" },
      { id: "pareja", label: "Pareja y familia" },
      { id: "trauma", label: "Trauma, duelo y crisis" },
    ],
  },
  {
    id: "q2",
    block: "A",
    kind: "multi",
    scoring: "info",
    title: "¿Cuál es tu segunda área de experiencia?",
    options: [
      { id: "adicciones", label: "Adicciones" },
      { id: "tca", label: "Trastornos de la conducta alimentaria" },
      { id: "violencia", label: "Violencia de género o intrafamiliar" },
      { id: "mayores", label: "Adultos mayores" },
    ],
  },
  {
    id: "q3",
    block: "A",
    kind: "single",
    scoring: "info",
    title: "¿Con qué población tienes más experiencia?",
    options: [
      { id: "ninos", label: "Niños (hasta 11 años)" },
      { id: "adolescentes", label: "Adolescentes (12 a 17 años)" },
      { id: "adultos", label: "Adultos" },
      { id: "mayores", label: "Adultos mayores" },
    ],
  },
  {
    id: "q4",
    block: "A",
    kind: "multi",
    scoring: "info",
    title: "¿Tienes formación específica en alguna de estas áreas?",
    exclusive: "ninguna",
    options: [
      {
        id: "neuro",
        label: "Neuropsicología o evaluación psicológica",
      },
      { id: "diversidad", label: "Sexualidad y diversidad (LGBTIQ+)" },
      { id: "tdah", label: "TDAH y trastornos del espectro autista" },
      { id: "ninguna", label: "Ninguna de estas" },
    ],
  },
  {
    id: "q5",
    block: "B",
    kind: "single",
    scoring: "scored",
    weight: 1,
    correct: "alianza",
    title:
      "¿Cuál es uno de los factores que mejor predice el éxito de una terapia, independientemente del enfoque?",
    options: [
      { id: "duracion", label: "La duración del tratamiento" },
      { id: "alianza", label: "La alianza terapéutica" },
      { id: "experiencia", label: "Los años de experiencia del terapeuta" },
      { id: "tecnicas", label: "El número de técnicas aplicadas" },
    ],
  },
  {
    id: "q6",
    block: "B",
    kind: "single",
    scoring: "scored",
    weight: 1,
    eliminatory: "always",
    correct: "tcc",
    title:
      "Un paciente acude por ataques de pánico. ¿Cuál es el tratamiento psicológico con más respaldo?",
    options: [
      {
        id: "evitar",
        label: "Enseñarle a evitar las situaciones que le generan ansiedad",
      },
      {
        id: "tcc",
        label:
          "Terapia cognitivo-conductual con psicoeducación y exposición a las sensaciones temidas",
      },
      {
        id: "infancia",
        label: "Explorar su infancia para encontrar el origen del pánico",
      },
      {
        id: "ansiolitico",
        label: "Recomendarle que lleve siempre un ansiolítico encima",
      },
    ],
  },
  {
    id: "q7",
    block: "B",
    kind: "single",
    scoring: "scored",
    weight: 2,
    correct: "activacion",
    title: "¿Qué intervención tiene buen respaldo empírico para la depresión?",
    options: [
      {
        id: "esperar",
        label:
          "Esperar a que el paciente se sienta motivado para retomar actividades",
      },
      { id: "activacion", label: "Activación conductual" },
      { id: "positivo", label: "Pedirle que piense en positivo" },
      {
        id: "descanso",
        label: "Recomendarle descanso total hasta que mejore",
      },
    ],
  },
  {
    id: "q8",
    block: "B",
    kind: "single",
    scoring: "scored",
    weight: 2,
    correct: "epr",
    title:
      "Un paciente con trastorno obsesivo-compulsivo te pide que le confirmes una y otra vez que no ha hecho daño a nadie. ¿Qué haces?",
    options: [
      {
        id: "confirmar",
        label: "Le doy la confirmación para calmar su ansiedad",
      },
      {
        id: "epr",
        label:
          "Entiendo que tranquilizarle refuerza el ciclo obsesivo, y trabajo con exposición con prevención de respuesta",
      },
      { id: "dejar", label: "Le digo que deje de pensar en eso" },
      { id: "derivar", label: "Lo derivo a psiquiatría sin intervenir" },
    ],
  },
  {
    id: "q9",
    block: "B",
    kind: "single",
    scoring: "scored",
    weight: 1,
    correct: "tcci",
    title:
      "Un paciente consulta por insomnio crónico. ¿Cuál es el tratamiento psicológico de primera línea?",
    options: [
      {
        id: "cama",
        label: "Recomendarle que pase más tiempo en la cama para descansar",
      },
      {
        id: "tcci",
        label: "Terapia cognitivo-conductual para el insomnio (TCC-I)",
      },
      { id: "melatonina", label: "Indicarle que tome melatonina" },
      {
        id: "television",
        label: "Recomendarle ver televisión hasta que le dé sueño",
      },
    ],
  },
  {
    id: "q10",
    block: "C",
    kind: "single",
    scoring: "scored",
    weight: 1,
    eliminatory: "always",
    correct: "seguridad",
    title:
      "Una pareja pide terapia, y en la primera sesión detectas que uno ejerce violencia y control sobre el otro. ¿Qué haces?",
    options: [
      {
        id: "seguir",
        label: "Sigo con la terapia de pareja para mejorar su comunicación",
      },
      {
        id: "seguridad",
        label:
          "Considero que la terapia de pareja conjunta está contraindicada, priorizo la seguridad de la víctima y ofrezco atención individual y recursos de protección",
      },
      {
        id: "resolver",
        label: "Les pido que resuelvan el conflicto antes de seguir",
      },
      {
        id: "ambos",
        label: "Trabajo la violencia como un problema de los dos por igual",
      },
    ],
  },
  {
    id: "q11",
    block: "C",
    kind: "single",
    scoring: "scored",
    weight: 2,
    correct: "motivacional",
    title:
      "Un paciente con consumo problemático de alcohol dice que quiere dejarlo pero que «aún no está listo». ¿Cómo lo abordas?",
    options: [
      {
        id: "consecuencias",
        label: "Le explico las consecuencias para que tome conciencia",
      },
      {
        id: "motivacional",
        label:
          "Entiendo la ambivalencia como algo esperable y trabajo con entrevista motivacional",
      },
      { id: "volver", label: "Le digo que vuelva cuando esté listo" },
      { id: "confrontar", label: "Lo confronto para romper su negación" },
    ],
  },
  {
    id: "q12",
    block: "C",
    kind: "single",
    scoring: "scored",
    weight: 1,
    eliminatory: "children",
    correct: "evaluacion",
    title:
      "Unos padres te piden un diagnóstico de TDAH para su hijo porque «no presta atención en clase». ¿Qué haces?",
    options: [
      {
        id: "diagnosticar",
        label: "Lo diagnostico si los padres describen los síntomas",
      },
      {
        id: "evaluacion",
        label:
          "Hago una evaluación completa, con información de varios contextos (casa, escuela) y descarto otras causas",
      },
      {
        id: "medicacion",
        label: "Les recomiendo que pidan medicación al pediatra",
      },
      {
        id: "normal",
        label: "Les digo que es normal a esa edad sin evaluar",
      },
    ],
  },
  {
    id: "q13",
    block: "C",
    kind: "single",
    scoring: "scored",
    weight: 1,
    eliminatory: "always",
    correct: "multidisciplinar",
    title:
      "Sospechas que una paciente adolescente tiene un trastorno de la conducta alimentaria con pérdida de peso importante. ¿Qué haces?",
    options: [
      {
        id: "sola",
        label: "Inicio terapia psicológica sola y veo cómo evoluciona",
      },
      {
        id: "multidisciplinar",
        label:
          "Coordino una evaluación médica y un abordaje multidisciplinario, implicando a la familia",
      },
      { id: "dieta", label: "Le pongo una dieta para que recupere peso" },
      { id: "esperar", label: "Espero a que ella reconozca el problema" },
    ],
  },
  {
    id: "q14",
    block: "C",
    kind: "single",
    scoring: "scored",
    weight: 1,
    eliminatory: "always",
    correct: "afirmativo",
    title:
      "Un paciente te dice que es homosexual y que quiere «cambiar su orientación». ¿Qué haces?",
    options: [
      { id: "cambiar", label: "Le ayudo a cambiarla, porque es lo que pide" },
      {
        id: "afirmativo",
        label:
          "Exploro el malestar que siente, trabajo desde un enfoque afirmativo y le explico que las terapias de conversión no son éticas ni eficaces",
      },
      { id: "religioso", label: "Lo derivo a un grupo religioso" },
      { id: "rechazar", label: "Le digo que no puedo atenderlo" },
    ],
  },
  {
    id: "q15",
    block: "C",
    kind: "single",
    scoring: "scored",
    weight: 1,
    eliminatory: "older",
    correct: "medica",
    title:
      "Una paciente de 78 años, que hasta ayer estaba bien, de repente aparece confundida y desorientada. ¿Qué haces?",
    options: [
      { id: "edad", label: "Lo atribuyo a la edad" },
      {
        id: "medica",
        label:
          "Lo considero una posible causa médica (como un delirium) y pido que la valore un médico de inmediato",
      },
      {
        id: "demencia",
        label: "Inicio una evaluación de demencia en la próxima sesión",
      },
      {
        id: "orientacion",
        label: "Trabajo técnicas de orientación en la realidad",
      },
    ],
  },
  {
    id: "q16",
    block: "D",
    kind: "single",
    scoring: "scored",
    weight: 1,
    correct: "demorado",
    title:
      "Un paciente que parecía estar bien empieza a tener síntomas de TEPT ocho meses después del terremoto. ¿Cómo lo interpretas?",
    options: [
      {
        id: "tarde",
        label:
          "No puede ser TEPT, porque los síntomas aparecieron demasiado tarde",
      },
      {
        id: "demorado",
        label:
          "Puede ser un TEPT de inicio demorado, que se diagnostica cuando los criterios completos aparecen al menos seis meses después del evento",
      },
      {
        id: "simulando",
        label: "Está simulando para obtener algún beneficio",
      },
      { id: "adaptacion", label: "Es un trastorno de adaptación" },
    ],
  },
  {
    id: "q18",
    block: "D",
    kind: "single",
    scoring: "scored",
    weight: 1,
    correct: "anclaje",
    title:
      "Durante una sesión online, tu paciente se queda con la mirada fija, deja de responder y parece «desconectado» mientras habla del terremoto. ¿Qué haces?",
    options: [
      {
        id: "preguntar",
        label: "Sigo preguntándole por el recuerdo para que lo procese",
      },
      {
        id: "anclaje",
        label:
          "Lo identifico como posible disociación y aplico técnicas de anclaje (grounding) para traerlo al presente, como nombrar objetos de su entorno o sentir los pies en el suelo",
      },
      {
        id: "terminar",
        label: "Termino la videollamada para que descanse",
      },
      { id: "silencio", label: "Espero en silencio hasta que reaccione" },
    ],
  },
  {
    id: "q19",
    block: "D",
    kind: "single",
    scoring: "scored",
    weight: 1,
    correct: "complejo",
    title:
      "Una paciente vivió abusos repetidos durante años y ahora presenta, además de síntomas de TEPT, dificultades graves para regular sus emociones, una visión muy negativa de sí misma y problemas para mantener relaciones. ¿Qué cuadro sugiere esto?",
    options: [
      { id: "limite", label: "Trastorno límite de la personalidad, sin más" },
      {
        id: "complejo",
        label:
          "TEPT complejo (según la CIE-11), que requiere priorizar la estabilización emocional antes del trabajo con el trauma",
      },
      { id: "depresion", label: "Depresión mayor" },
      {
        id: "simple",
        label: "TEPT simple, se trata igual que cualquier otro",
      },
    ],
  },
  {
    id: "q20",
    block: "D",
    kind: "single",
    scoring: "scored",
    weight: 1,
    correct: "validar",
    title:
      "Un sobreviviente del terremoto se siente culpable porque él sobrevivió y su vecino no. ¿Cómo lo trabajas?",
    options: [
      {
        id: "sinmotivo",
        label: "Le digo que no tiene motivos para sentirse culpable",
      },
      {
        id: "validar",
        label:
          "Valido su emoción y exploro con él esas creencias de culpa, que son frecuentes en sobrevivientes, para trabajarlas de forma terapéutica",
      },
      {
        id: "evitar",
        label: "Evito el tema para no hacerle sentir peor",
      },
      {
        id: "afortunado",
        label: "Le recomiendo que piense en lo afortunado que es",
      },
    ],
  },
  {
    id: "exclusions",
    block: "E",
    kind: "text",
    scoring: "info",
    minLength: 15,
    maxLength: 2000,
    title: "¿Qué tipo de pacientes o problemáticas NO atenderías, y por qué?",
  },
];
