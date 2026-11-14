import type { MarketEventKind } from "./types";

/** Spanish copy and the secret word that sends each hidden market event (real news, Sep–Nov 2026). */
export const EVENT_COPY: Record<
  MarketEventKind,
  { readonly word: string; readonly icon: string; readonly title: string; readonly message: string }
> = {
  "send-spy": {
    word: "spy",
    icon: "🕵️",
    title: "Nvidia y un posible caso de espionaje (nov 2026)",
    message:
      "Nov 2026 · Según reportes, se investiga un posible caso de espionaje en torno al CEO de Nvidia, que renuncia; la acción cae 13 % en la semana: Andes Arriesgado sufre",
  },
  "send-intel": {
    word: "intel",
    icon: "📉",
    title: "Desplome de Intel (30 oct 2026)",
    message:
      "30 oct 2026 · Intel cae 29 %, su peor día desde 1974, y las tecnológicas pierden más de US$1 billón: Andes Arriesgado se desploma",
  },
  "send-coreweave": {
    word: "coreweave",
    icon: "🚀",
    title: "Rebote de la IA (10–11 nov 2026)",
    message:
      "10–11 nov 2026 · Rebote de la IA: el Nasdaq-100 tiene su mejor día desde marzo y CoreWeave sube 25 %: euforia en los fondos de mayor riesgo",
  },
  "send-afp": {
    word: "afp",
    icon: "🏦",
    title: "Caída del Fondo E de las AFP (sep 2026)",
    message:
      "Sep 2026 · El alza de tasas y las pérdidas en swaps hunden al Fondo E de las AFP (−4,9 % en el mes): Cristóbal Conservador cae",
  },
};
