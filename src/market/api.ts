import { broadcast } from "@solidjs/web/server-functions";
import type { PriceTick } from "./types";
import { priceHistory, watchPrices } from "~/server/simulation";

export const livePrices = broadcast(async function* (): AsyncGenerator<PriceTick> {
  "use server";
  yield* watchPrices();
});

/** The simulated history window, one tick per day, oldest first. */
export async function getPriceHistory(): Promise<PriceTick[]> {
  "use server";
  return [...priceHistory()];
}
