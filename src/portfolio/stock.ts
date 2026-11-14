/** Latest CLP price by fund id. */
export type PriceLookup = Readonly<Record<string, number>>;

export const CASH_ID = "cash";

type StockInit = { id: string; name: string; shares: number };

/** An immutable position in whole shares of one demo fund. */
export class Stock {
  readonly id: string;
  readonly name: string;
  readonly shares: number;

  /** Reject quantities that would introduce fractional shares or leverage. */
  constructor(init: StockInit) {
    if (
      !Number.isFinite(init.shares) ||
      init.shares < 0 ||
      (!(this instanceof Cash) && !Number.isInteger(init.shares))
    ) {
      throw new RangeError(
        "Shares must be a non-negative integer; cash must be finite and non-negative",
      );
    }
    this.id = init.id;
    this.name = init.name;
    this.shares = init.shares;
    Object.freeze(this);
  }

  /** Read the latest usable quote; missing or invalid quotes cannot value a position. */
  currentPrice(prices: PriceLookup): number {
    const price = Object.hasOwn(prices, this.id) ? prices[this.id] : undefined;
    if (price === undefined || !Number.isFinite(price) || price <= 0) {
      throw new RangeError(`Missing or invalid price for ${this.id}`);
    }
    return price;
  }

  /** Value this holding in CLP at the supplied quotes. */
  value(prices: PriceLookup): number {
    return this.shares * this.currentPrice(prices);
  }

  /** Copy this position using its concrete class and constructor contract. */
  withShares(shares: number): Stock {
    const Position = this.constructor as new (init: StockInit) => Stock;
    return new Position({ id: this.id, name: this.name, shares });
  }
}

/** Uninvested CLP, held only when whole shares cannot absorb the balance. */
export class Cash extends Stock {
  /** Store monetary quantities to two decimals to remove floating-point noise. */
  constructor(amount: number) {
    if (!Number.isFinite(amount) || amount < 0)
      throw new RangeError("Cash must be finite and non-negative");
    super({ id: CASH_ID, name: "Caja", shares: Math.round((amount + Number.EPSILON) * 100) / 100 });
  }

  /** One unit of cash is always one CLP. */
  override currentPrice(_prices?: PriceLookup): number {
    return 1;
  }

  /** Copy the cash position while retaining monetary rounding. */
  override withShares(shares: number): Cash {
    const Position = this.constructor as new (amount: number) => Cash;
    return new Position(shares);
  }
}
