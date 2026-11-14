import "number-flow";
import type NumberFlow from "number-flow";
import type { Format } from "number-flow";
import { createEffect } from "solid-js";

declare module "@solidjs/web/jsx-runtime" {
  namespace JSX {
    interface IntrinsicElements {
      "number-flow": HTMLAttributes<NumberFlow>;
    }
  }
}

export interface AnimatedNumberProps {
  readonly value: number;
  /** Intl options; read once when the element is created. */
  readonly format?: Format;
  readonly suffix?: string;
}

/**
 * A number that rolls its digits to the new value instead of jumping, using the
 * framework-agnostic `<number-flow>` custom element. Solid only pushes the new
 * value into it; the element animates the change.
 */
export function AnimatedNumber(props: AnimatedNumberProps) {
  let element: NumberFlow | undefined;
  createEffect(
    () => props.value,
    (value) => {
      element?.update(value);
    },
  );
  return (
    <number-flow
      ref={(el: NumberFlow) => {
        element = el;
        el.locales = "es-CL";
        el.format = props.format;
        el.numberSuffix = props.suffix;
      }}
    />
  );
}
