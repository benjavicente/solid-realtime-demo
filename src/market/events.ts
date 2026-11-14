import type { MarketEventKind } from "./types";

/** Spanish copy and the secret word that sends each hidden market event. */
export const EVENT_COPY: Record<
  MarketEventKind,
  { readonly word: string; readonly icon: string; readonly title: string; readonly message: string }
> = {
  "send-spy": {
    word: "spy",
    icon: "🕵️",
    title: "Un espía filtró malas noticias",
    message: "Un espía filtró malas noticias: Andes Arriesgado atraviesa una semana difícil",
  },
  "send-moon": {
    word: "moon",
    icon: "🚀",
    title: "Euforia en el mercado",
    message: "Euforia en el mercado: todos los fondos se inflan, los más riesgosos más",
  },
  "send-retiro": {
    word: "retiro",
    icon: "🏦",
    title: "Retiro masivo de fondos de pensiones",
    message:
      "Retiro masivo de fondos de pensiones: las ventas forzadas de bonos golpean a Cristóbal Conservador",
  },
};
