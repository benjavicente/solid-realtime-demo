import type { MarketEventKind } from "./types";

/** Spanish copy and the secret word that sends each hidden market event. */
export const EVENT_COPY: Record<
  MarketEventKind,
  { readonly word: string; readonly icon: string; readonly title: string; readonly message: string }
> = {
  "send-deepseek": {
    word: "deepseek",
    icon: "📉",
    title: "DeepSeek R1 (27 ene 2025)",
    message:
      "27 ene 2025 · DeepSeek lanza R1 y Nvidia cae 17 % en un día (−US$589 mil millones, récord histórico): Andes Arriesgado se desploma",
  },
  "send-nvidia": {
    word: "nvidia",
    icon: "🚀",
    title: "Resultados de Nvidia (25 may 2023)",
    message:
      "25 may 2023 · Nvidia proyecta US$11 mil millones por IA y sube 24 % en un día: euforia en los fondos de mayor riesgo",
  },
  "send-afp": {
    word: "afp",
    icon: "🏦",
    title: "Primer retiro del 10 % de las AFP (jul 2020)",
    message:
      "Jul 2020 · Primer retiro del 10 % de las AFP: las ventas forzadas de bonos golpean a Cristóbal Conservador",
  },
};
