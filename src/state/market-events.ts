import { onSettled } from "solid-js";
import { useTypedSequence } from "../components/useTypedSequence";
import { sendMarketEvent } from "../market/api";
import { EVENT_COPY } from "../market/events";
import { MARKET_EVENT_KINDS, type MarketEventKind } from "../market/types";

/**
 * Hidden market events: type the secret word anywhere on the page, or call
 * `moka.send("send-afp")` from the browser console (see README).
 */
export function useMarketEvents() {
  const send = (kind: MarketEventKind) => {
    sendMarketEvent(kind).catch((error: unknown) => console.warn("Market event failed", error));
  };
  for (const kind of MARKET_EVENT_KINDS) useTypedSequence(EVENT_COPY[kind].word, () => send(kind));
  onSettled(() => {
    const global = window as unknown as { moka?: unknown };
    global.moka = { send, events: MARKET_EVENT_KINDS };
    return () => {
      delete global.moka;
    };
  });
}
