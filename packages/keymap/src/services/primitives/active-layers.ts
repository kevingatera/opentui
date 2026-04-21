import type { KeymapEvent, KeymapHost, RegisteredLayer, RegisteredLayerBucket } from "../../types.js"

export function getFocusedTargetIfAvailable<TTarget extends object, TEvent extends KeymapEvent>(
  host: KeymapHost<TTarget, TEvent>,
): TTarget | null {
  if (host.isDestroyed) {
    return null
  }

  return host.getFocusedTarget()
}

export function forEachActivationTarget<TTarget extends object, TEvent extends KeymapEvent>(
  host: KeymapHost<TTarget, TEvent>,
  focused: TTarget | null,
  visit: (target: TTarget, isFocusedTarget: boolean) => boolean | void,
): void {
  let current: TTarget | null = focused ?? host.rootTarget
  let isFocusedTarget = focused !== null

  while (current) {
    const shouldContinue = visit(current, isFocusedTarget)
    if (shouldContinue === false) {
      return
    }

    current = host.getParentTarget(current)
    isFocusedTarget = false
  }
}

export function getActiveLayersForFocused<TTarget extends object, TEvent extends KeymapEvent>(
  targetLayers: WeakMap<TTarget, RegisteredLayerBucket<TTarget, TEvent>>,
  host: KeymapHost<TTarget, TEvent>,
  focused: TTarget | null,
): RegisteredLayer<TTarget, TEvent>[] {
  const activeLayers: RegisteredLayer<TTarget, TEvent>[] = []

  forEachActivationTarget(host, focused, (current, isFocusedTarget) => {
    const bucket = targetLayers.get(current)
    if (!bucket) {
      return
    }

    if (isFocusedTarget) {
      activeLayers.push(...bucket.focusLayers)
    }

    activeLayers.push(...bucket.focusWithinLayers)
  })

  return activeLayers
}

export function isLayerActiveForFocused<TTarget extends object, TEvent extends KeymapEvent>(
  host: KeymapHost<TTarget, TEvent>,
  layer: RegisteredLayer<TTarget, TEvent>,
  focused: TTarget | null,
): boolean {
  const target = layer.indexTarget
  if (host.isTargetDestroyed(target)) {
    return false
  }

  if (layer.scope === "focus") {
    return target === focused
  }

  let isActive = false
  forEachActivationTarget(host, focused, (current) => {
    if (current === target) {
      isActive = true
      return false
    }

    return true
  })

  return isActive
}
