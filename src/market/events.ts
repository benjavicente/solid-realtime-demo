import type { MarketEventKind } from "./types";

/** Spanish copy and the secret word that sends each hidden market event (real news, Sep–Nov 2026). */
export const EVENT_COPY: Record<
  MarketEventKind,
  { readonly word: string; readonly icon: string; readonly title: string; readonly message: string }
> = {
  "send-spy": {
    word: "spy",
    icon: "🕵️",
    title: "Nvidia bajo presión",
    message:
      "Entre reportes de una investigación ligada a espionaje y la salida de su CEO, Nvidia cae 13 % en una semana: Andes Arriesgado sufre",
  },
  "send-intel": {
    word: "intel",
    icon: "📉",
    title: "Desplome de Intel",
    message:
      "Intel cae 29 % en un día y las tecnológicas pierden más de US$1 billón: Andes Arriesgado se desploma",
  },
  "send-coreweave": {
    word: "coreweave",
    icon: "🚀",
    title: "Rebote de la IA",
    message:
      "Rebote de la IA: el Nasdaq-100 tiene su mejor día en meses y CoreWeave sube 25 %: euforia en los fondos de mayor riesgo",
  },
  "send-afp": {
    word: "afp",
    icon: "🏦",
    title: "Caída del Fondo E de las AFP",
    message:
      "El alza de tasas y las pérdidas en swaps hunden al Fondo E de las AFP (−4,9 % en un mes): Cristóbal Conservador cae",
  },
};
