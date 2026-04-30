import { plugin as registerBunPlugin } from "bun"
import * as coreRuntime from "@opentui/core"
import * as threeRuntime from "@opentui/three"
import {
  createRuntimePlugin,
  isCoreRuntimeModuleSpecifier,
  runtimeModuleIdForSpecifier,
  type RuntimeModuleEntry,
} from "@opentui/core/runtime-plugin"
import * as solidRuntime from "@opentui/solid"
import { ensureSolidTransformPlugin } from "@opentui/solid/bun-plugin"
import * as solidJsRuntime from "solid-js"
import * as solidJsStoreRuntime from "solid-js/store"

const externalPluginRuntimeSupportInstalledKey = Symbol.for("opentui.solid.examples.external-plugin-runtime")

type ExternalPluginRuntimeSupportState = typeof globalThis & {
  [externalPluginRuntimeSupportInstalledKey]?: boolean
}

const additionalRuntimeModules: Record<string, RuntimeModuleEntry> = {
  "@opentui/three": threeRuntime as Record<string, unknown>,
  "@opentui/solid": solidRuntime as Record<string, unknown>,
  "solid-js": solidJsRuntime as Record<string, unknown>,
  "solid-js/store": solidJsStoreRuntime as Record<string, unknown>,
}

const resolveRuntimeSpecifier = (specifier: string): string | null => {
  if (!isCoreRuntimeModuleSpecifier(specifier) && !additionalRuntimeModules[specifier]) {
    return null
  }

  return runtimeModuleIdForSpecifier(specifier)
}

export function ensureExternalPluginRuntimeSupport(): boolean {
  const state = globalThis as ExternalPluginRuntimeSupportState

  if (state[externalPluginRuntimeSupportInstalledKey]) {
    return false
  }

  ensureSolidTransformPlugin({
    moduleName: runtimeModuleIdForSpecifier("@opentui/solid"),
    resolvePath(specifier) {
      return resolveRuntimeSpecifier(specifier)
    },
  })

  registerBunPlugin(
    createRuntimePlugin({
      core: coreRuntime as Record<string, unknown>,
      additional: additionalRuntimeModules,
    }),
  )

  state[externalPluginRuntimeSupportInstalledKey] = true
  return true
}

ensureExternalPluginRuntimeSupport()
