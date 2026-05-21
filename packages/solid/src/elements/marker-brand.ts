import type { TextNodeRenderable } from "@opentui/core"

export const BrandedMarkerRenderable: unique symbol = Symbol.for("@opentui/solid/MarkerRenderable")

export type MarkerTextNodeRenderable = TextNodeRenderable & { [BrandedMarkerRenderable]: true }

export function isMarkerRenderable(obj: any): obj is MarkerTextNodeRenderable {
  return !!obj?.[BrandedMarkerRenderable]
}
