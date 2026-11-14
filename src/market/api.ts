import { broadcast } from "@solidjs/web/server-functions";
import { HOUR_MS, SIM_MS_PER_TICK } from "./funds";
import type { PriceTick } from "./types";
import { priceHistory, watchPrices } from "~/server/simulation";

export const livePrices = broadcast(async function* (): AsyncGenerator<PriceTick> {
  "use server";
  yield* watchPrices();
});

export async function getPriceHistory(): Promise<PriceTick[]> {
  "use server";
  const history = priceHistory();
  const stride = Math.max(1, Math.round((4 * HOUR_MS) / SIM_MS_PER_TICK));
  return history.filter((_, index) => index % stride === 0 || index === history.length - 1);
}
