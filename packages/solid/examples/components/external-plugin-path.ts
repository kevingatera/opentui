import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT_PLUGIN_ENTRY = ".plugin/index.tsx"

type ResolveExternalPluginCandidatesInput = {
  cwd: string
  execPath: string
  moduleUrl: string
  envPath?: string
}

export function normalizeExternalPluginPath(input: string, cwd: string): string {
  if (input.startsWith("file://")) {
    return fileURLToPath(input)
  }

  if (isAbsolute(input)) {
    return input
  }

  return resolve(cwd, input)
}

export function resolveExternalPluginCandidates(input: ResolveExternalPluginCandidatesInput): string[] {
  const paths = new Set<string>()
  const moduleDir = dirname(fileURLToPath(input.moduleUrl))
  const execDir = dirname(input.execPath)

  if (input.envPath && input.envPath.trim().length > 0) {
    paths.add(normalizeExternalPluginPath(input.envPath.trim(), input.cwd))
  }

  paths.add(resolve(input.cwd, DEFAULT_PLUGIN_ENTRY))
  paths.add(join(execDir, DEFAULT_PLUGIN_ENTRY))
  paths.add(resolve(execDir, "..", DEFAULT_PLUGIN_ENTRY))
  paths.add(resolve(moduleDir, "..", DEFAULT_PLUGIN_ENTRY))
  paths.add(resolve(input.cwd, "packages", "solid", "examples", DEFAULT_PLUGIN_ENTRY))
  paths.add(resolve(execDir, "..", "..", DEFAULT_PLUGIN_ENTRY))

  return [...paths]
}
