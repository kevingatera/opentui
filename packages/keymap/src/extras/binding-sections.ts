// Opinionated config-to-keymap transformation helper. Treat this as one
// practical shape you can copy and adjust for application-specific needs.
import type { Binding, KeyLike, KeymapEvent } from "../types.js"

export type BindingSectionItem<TTarget extends object = object, TEvent extends KeymapEvent = KeymapEvent> =
  | KeyLike
  | Binding<TTarget, TEvent>

export type BindingValue<TTarget extends object = object, TEvent extends KeymapEvent = KeymapEvent> =
  | false
  | "none"
  | BindingSectionItem<TTarget, TEvent>
  | readonly BindingSectionItem<TTarget, TEvent>[]

export type BindingSectionConfig<TTarget extends object = object, TEvent extends KeymapEvent = KeymapEvent> = Readonly<
  Record<string, BindingValue<TTarget, TEvent>>
>

export type BindingSectionsConfig<
  TTarget extends object = object,
  TEvent extends KeymapEvent = KeymapEvent,
> = BindingSectionConfig<TTarget, TEvent>

type LiteralStringKeys<T> = string extends Extract<keyof T, string> ? never : Extract<keyof T, string>
type CommandSection<TCommand extends string> = TCommand extends `${infer TSection}.${string}` ? TSection : never
type LiteralConfigSections<TConfig> = CommandSection<LiteralStringKeys<TConfig>>

const hasOwn = Object.prototype.hasOwnProperty

export interface BindingDefaultsContext<TTarget extends object = object, TEvent extends KeymapEvent = KeymapEvent> {
  section: string
  command: string
  binding: Readonly<Binding<TTarget, TEvent>>
}

export type BindingDefaults<TTarget extends object = object, TEvent extends KeymapEvent = KeymapEvent> = (
  ctx: BindingDefaultsContext<TTarget, TEvent>,
) => Readonly<Record<string, unknown>> | void

export interface ResolvedBindingSections<
  TTarget extends object = object,
  TEvent extends KeymapEvent = KeymapEvent,
  TSection extends string = string,
> {
  sections: Record<TSection, Binding<TTarget, TEvent>[]>
  get(section: string, cmd: string): readonly Binding<TTarget, TEvent>[] | undefined
  pick(section: string, commands: readonly string[]): Binding<TTarget, TEvent>[]
  omit(section: string, commands: readonly string[]): Binding<TTarget, TEvent>[]
}

export interface ResolveBindingSectionsOptions<
  TSection extends string = string,
  TTarget extends object = object,
  TEvent extends KeymapEvent = KeymapEvent,
> {
  sections?: readonly TSection[]
  bindingDefaults?: BindingDefaults<TTarget, TEvent>
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isKeyLike(value: unknown): value is KeyLike {
  return typeof value === "string" || isObject(value)
}

function cloneKeyLike(key: KeyLike): KeyLike {
  if (typeof key === "string") {
    return key
  }

  return { ...key }
}

function invalidBindingValue(command: string, index?: number): Error {
  const location = index === undefined ? `"${command}"` : `"${command}" at index ${index}`
  return new Error(
    `Invalid binding value for ${location}: expected false, a key, a binding object, or an array of keys/binding objects`,
  )
}

function getCommandSection(command: string): string {
  const separatorIndex = command.indexOf(".")
  if (separatorIndex <= 0 || separatorIndex === command.length - 1) {
    throw new Error(`Invalid binding command "${command}": expected a dot-delimited command name with a section prefix`)
  }

  return command.slice(0, separatorIndex)
}

function resolveBindingItem<TTarget extends object, TEvent extends KeymapEvent>(
  command: string,
  item: BindingSectionItem<TTarget, TEvent>,
  index?: number,
): Binding<TTarget, TEvent> {
  if (!isKeyLike(item)) {
    throw invalidBindingValue(command, index)
  }

  if (typeof item === "string" || !("key" in item)) {
    return {
      key: cloneKeyLike(item),
      cmd: command,
    }
  }

  const key = item.key
  if (!isKeyLike(key)) {
    throw invalidBindingValue(command, index)
  }

  return {
    ...item,
    key: cloneKeyLike(key),
    cmd: command,
  }
}

function resolveBindingValue<TTarget extends object, TEvent extends KeymapEvent>(
  section: string,
  command: string,
  value: BindingValue<TTarget, TEvent>,
  bindingDefaults: BindingDefaults<TTarget, TEvent> | undefined,
): Binding<TTarget, TEvent>[] | undefined {
  if (value === false || value === "none") {
    return undefined
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined
    }

    const items = value as readonly BindingSectionItem<TTarget, TEvent>[]
    const bindings = new Array<Binding<TTarget, TEvent>>(items.length)
    for (let index = 0; index < items.length; index += 1) {
      const binding = resolveBindingItem(command, items[index]!, index)
      bindings[index] = bindingDefaults ? withBindingDefaults(section, command, binding, bindingDefaults) : binding
    }

    return bindings
  }

  const binding = resolveBindingItem(command, value as BindingSectionItem<TTarget, TEvent>)
  return [bindingDefaults ? withBindingDefaults(section, command, binding, bindingDefaults) : binding]
}

function withBindingDefaults<TTarget extends object, TEvent extends KeymapEvent>(
  section: string,
  command: string,
  binding: Binding<TTarget, TEvent>,
  bindingDefaults: BindingDefaults<TTarget, TEvent> | undefined,
): Binding<TTarget, TEvent> {
  const defaults = bindingDefaults?.({ section, command, binding })
  if (!defaults) return binding
  return { ...defaults, ...binding }
}

export function resolveBindingSections<
  TTarget extends object = object,
  TEvent extends KeymapEvent = KeymapEvent,
  const TConfig extends BindingSectionsConfig<TTarget, TEvent> = BindingSectionsConfig<TTarget, TEvent>,
  const TSection extends string = string,
>(
  config: TConfig,
  options: ResolveBindingSectionsOptions<TSection, TTarget, TEvent> & { sections: readonly TSection[] },
): ResolvedBindingSections<TTarget, TEvent, TSection | LiteralConfigSections<TConfig>>
export function resolveBindingSections<TTarget extends object = object, TEvent extends KeymapEvent = KeymapEvent>(
  config: BindingSectionsConfig<TTarget, TEvent>,
  options?: ResolveBindingSectionsOptions<string, TTarget, TEvent>,
): ResolvedBindingSections<TTarget, TEvent>
export function resolveBindingSections<TTarget extends object = object, TEvent extends KeymapEvent = KeymapEvent>(
  config: BindingSectionsConfig<TTarget, TEvent>,
  options?: ResolveBindingSectionsOptions<string, TTarget, TEvent>,
): ResolvedBindingSections<TTarget, TEvent> {
  const sections: Record<string, Binding<TTarget, TEvent>[]> = {}
  const lookups = new Map<string, Map<string, Binding<TTarget, TEvent>[]>>()
  const bindingDefaults = options?.bindingDefaults

  for (const section of options?.sections ?? []) {
    sections[section] = []
    lookups.set(section, new Map())
  }

  const dirtySections = new Set<string>()

  // Own-property loops avoid Object.entries allocations while still ignoring inherited config.
  for (const rawCommand in config) {
    if (!hasOwn.call(config, rawCommand)) {
      continue
    }

    const command = rawCommand.trim()
    const section = getCommandSection(command)
    const sectionLookup = lookups.get(section) ?? new Map<string, Binding<TTarget, TEvent>[]>()
    const bindings = resolveBindingValue(section, command, config[rawCommand]!, bindingDefaults)

    if (!bindings) {
      sectionLookup.delete(command)
    } else {
      sectionLookup.set(command, bindings)
    }

    lookups.set(section, sectionLookup)
    dirtySections.add(section)
  }

  for (const section of dirtySections) {
    const sectionLookup = lookups.get(section)!
    // Manual flattening avoids Array.flat allocations on large generated configs.
    let sectionBindingCount = 0
    for (const bindings of sectionLookup.values()) {
      sectionBindingCount += bindings.length
    }

    const sectionBindings = new Array<Binding<TTarget, TEvent>>(sectionBindingCount)
    let bindingIndex = 0
    for (const bindings of sectionLookup.values()) {
      for (let index = 0; index < bindings.length; index += 1) {
        sectionBindings[bindingIndex] = bindings[index]!
        bindingIndex += 1
      }
    }

    sections[section] = sectionBindings
    lookups.set(section, sectionLookup)
  }

  return {
    sections,
    get(section, cmd) {
      return lookups.get(section)?.get(cmd.trim())
    },
    pick(section, commands) {
      const lookup = lookups.get(section)
      if (!lookup) return []

      const result: Binding<TTarget, TEvent>[] = []
      for (const command of commands) {
        const bindings = lookup.get(command)
        if (!bindings) continue
        for (let index = 0; index < bindings.length; index += 1) {
          result.push(bindings[index]!)
        }
      }

      return result
    },
    omit(section, commands) {
      const sectionBindings = sections[section]
      if (!sectionBindings) return []
      if (commands.length === 0) return sectionBindings.slice()

      const omitted = new Set(commands)
      const result: Binding<TTarget, TEvent>[] = []
      for (let index = 0; index < sectionBindings.length; index += 1) {
        const binding = sectionBindings[index]!
        if (typeof binding.cmd === "string" && omitted.has(binding.cmd)) continue
        result.push(binding)
      }

      return result
    },
  }
}
