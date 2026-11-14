import { broadcast } from "@solidjs/web/server-functions";
import type { PriceTick } from "./types";
import { priceHistory, watchPrices } from "~/server/simulation";

export const livePrices = broadcast(async function* (): AsyncGenerator<PriceTick> {
  "use server";
  yield* watchPrices();
});

/** The last simulated year, one tick per day (365 points), oldest first. */
export async function getPriceHistory(): Promise<PriceTick[]> {
  "use server";
  return [...priceHistory()];
}
