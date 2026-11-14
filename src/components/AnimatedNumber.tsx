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

const SUBTLE: EffectTiming = { duration: 280, easing: "cubic-bezier(0.2, 0, 0, 1)" };
const FADE: EffectTiming = { duration: 160, easing: "ease-out" };

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
        // Short, eased transitions so live prices drift instead of spinning. The default
        // trend (sign of the change) rolls digits like an odometer: 9 → 0 is one step.
        el.transformTiming = SUBTLE;
        el.spinTiming = SUBTLE;
        el.opacityTiming = FADE;
      }}
    />
  );
}
