import type { FundId } from "../market/funds";
import type { SerializedTimeline } from "../portfolio";

const STORAGE_KEY = "moka-portafolio:v1";

/** What a browser keeps across reloads. */
export interface StoredState {
  readonly timeline: SerializedTimeline;
  readonly targets: Readonly<Partial<Record<FundId, string>>>;
}

export function loadState(): Partial<StoredState> | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<StoredState>) : undefined;
  } catch {
    return undefined;
  }
}

export function saveState(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or disabled: the demo keeps working, just without persistence.
  }
}
