export type DiffAction = "buy" | "sell" | "hold";

type StockDiffInit = {
  stockId: string;
  name: string;
  price: number;
  sharesBefore: number;
  sharesAfter: number;
  targetPercent: number;
  resultingPercent: number;
};

/** An immutable before/after trade proposal at a single price snapshot. */
export class StockDiff {
  readonly stockId: string;
  readonly name: string;
  readonly price: number;
  readonly sharesBefore: number;
  readonly sharesAfter: number;
  readonly targetPercent: number;
  readonly resultingPercent: number;

  /** Capture the quote and allocations used to prepare this trade. */
  constructor(init: StockDiffInit) {
    this.stockId = init.stockId;
    this.name = init.name;
    this.price = init.price;
    this.sharesBefore = init.sharesBefore;
    this.sharesAfter = init.sharesAfter;
    this.targetPercent = init.targetPercent;
    this.resultingPercent = init.resultingPercent;
    Object.freeze(this);
  }

  /** Positive quantities buy; negative quantities sell. */
  get deltaShares(): number {
    return this.sharesAfter - this.sharesBefore;
  }

  /** Signed CLP required for the proposed change. */
  get amount(): number {
    return this.deltaShares * this.price;
  }

  /** Describe the direction of this holding's change. */
  get action(): DiffAction {
    return this.deltaShares > 0 ? "buy" : this.deltaShares < 0 ? "sell" : "hold";
  }
}
