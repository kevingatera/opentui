import { plugin as registerBunPlugin } from "bun"
import * as coreRuntime from "@opentui/core"
import {
  createRuntimePlugin,
  isCoreRuntimeModuleSpecifier,
  runtimeModuleIdForSpecifier,
  type RuntimeModuleEntry,
} from "@opentui/core/runtime-plugin"
import * as solidJsRuntime from "solid-js"
import * as solidJsStoreRuntime from "solid-js/store"
import * as solidRuntime from "../index.js"
import { ensureSolidTransformPlugin } from "./solid-plugin.js"

const runtimePluginSupportInstalledKey = Symbol.for("opentui.solid.runtime-plugin-support")
const THREE_RUNTIME_SPECIFIER = "@opentui/three"

type RuntimePluginSupportState = typeof globalThis & {
  [runtimePluginSupportInstalledKey]?: boolean
}

const loadThreeRuntimeModule = async (): Promise<Record<string, unknown>> => {
  try {
    return (await importRuntimeModule(THREE_RUNTIME_SPECIFIER)) as Record<string, unknown>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Failed to load @opentui/three runtime module. Install @opentui/three in the host app before loading 3D plugins. ${message}`,
    )
  }
}

function importRuntimeModule(specifier: string): Promise<Record<string, unknown>> {
  return import(specifier) as Promise<Record<string, unknown>>
}

const additionalRuntimeModules: Record<string, RuntimeModuleEntry> = {
  [THREE_RUNTIME_SPECIFIER]: loadThreeRuntimeModule,
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

export function ensureRuntimePluginSupport(): boolean {
  const state = globalThis as RuntimePluginSupportState

  if (state[runtimePluginSupportInstalledKey]) {
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

  state[runtimePluginSupportInstalledKey] = true
  return true
}

ensureRuntimePluginSupport()
