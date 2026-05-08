import { describe, expect, test } from "bun:test"
import { resolveBindingSections, type BindingValue } from "../index.js"
import type { Binding } from "../../index.js"
import { createTestKeymap } from "../../testing/index.js"

describe("resolveBindingSections helper", () => {
  test("resolves flat command config into derived section binding arrays", () => {
    const leaderQuit = "<leader>q"
    const saveKey = { name: "s", ctrl: true }

    const resolved = resolveBindingSections({
      " command.palette.show ": "ctrl+p",
      "app.exit": ["ctrl+c", "ctrl+d", leaderQuit],
      "file.save": saveKey,
      "prompt.paste": {
        key: "ctrl+v",
        preventDefault: false,
        fallthrough: true,
        event: "press",
        desc: "Paste",
      },
    })

    expect(resolved.sections.command).toEqual([{ key: "ctrl+p", cmd: "command.palette.show" }])
    expect(resolved.sections.app).toEqual([
      { key: "ctrl+c", cmd: "app.exit" },
      { key: "ctrl+d", cmd: "app.exit" },
      { key: "<leader>q", cmd: "app.exit" },
    ])
    expect(resolved.sections.file).toEqual([{ key: { name: "s", ctrl: true }, cmd: "file.save" }])
    expect(resolved.sections.prompt).toEqual([
      {
        key: "ctrl+v",
        cmd: "prompt.paste",
        preventDefault: false,
        fallthrough: true,
        event: "press",
        desc: "Paste",
      },
    ])
    expect(resolved.get("command", " command.palette.show ")).toEqual([{ key: "ctrl+p", cmd: "command.palette.show" }])
    expect(resolved.get("app", "app.missing")).toBeUndefined()
    expect(resolved.get("missing", "app.exit")).toBeUndefined()
    expect(resolved.get("file", "file.save")?.[0]?.key).not.toBe(saveKey)
  })

  test("includes requested sections that are missing from sparse config", () => {
    const sectionNames = ["app", "prompt", "dialog_select"] as const
    type SectionName = (typeof sectionNames)[number]
    type KeymapSections = Record<SectionName, Binding[]>

    const resolved = resolveBindingSections(
      {
        "app.save": "s",
        "custom.run": "r",
      },
      {
        sections: sectionNames,
      },
    )
    const typedSections: KeymapSections = resolved.sections

    expect(Object.keys(resolved.sections)).toEqual(["app", "prompt", "dialog_select", "custom"])
    expect(typedSections.app).toEqual([{ key: "s", cmd: "app.save" }])
    expect(typedSections.prompt).toEqual([])
    expect(typedSections.dialog_select).toEqual([])
    expect(resolved.sections.custom).toEqual([{ key: "r", cmd: "custom.run" }])
    expect(typedSections.prompt).not.toBe(typedSections.dialog_select)
    expect(resolved.get("app", "app.save")).toEqual([{ key: "s", cmd: "app.save" }])
    expect(resolved.get("prompt", "app.save")).toBeUndefined()
    expect(resolved.get("dialog_select", "custom.run")).toBeUndefined()
    expect(resolved.get("custom", "custom.run")).toEqual([{ key: "r", cmd: "custom.run" }])
  })

  test("picks command bindings from a section in caller order", () => {
    const resolved = resolveBindingSections({
      "app.first": "1",
      "app.second": ["2a", { key: "2b", preventDefault: false }],
      "app.disabled": false,
      "app.third": "3",
    })

    expect(resolved.sections.app).toEqual([
      { key: "1", cmd: "app.first" },
      { key: "2a", cmd: "app.second" },
      { key: "2b", cmd: "app.second", preventDefault: false },
      { key: "3", cmd: "app.third" },
    ])
    expect(resolved.pick("app", ["app.third", "missing", "app.second", "app.disabled", "app.first"])).toEqual([
      { key: "3", cmd: "app.third" },
      { key: "2a", cmd: "app.second" },
      { key: "2b", cmd: "app.second", preventDefault: false },
      { key: "1", cmd: "app.first" },
    ])
    expect(resolved.pick("app", [" app.third "])).toEqual([])
    expect(resolved.pick("missing", ["app.first"])).toEqual([])
    expect(resolved.pick("app", [])).toEqual([])
  })

  test("omits command bindings from a section while preserving section order", () => {
    const fn = () => {}
    const resolved = resolveBindingSections({
      "app.first": "1",
      "app.second": ["2a", { key: "2b", preventDefault: false }],
      "app.third": "3",
      "app.exact": "4",
    })
    const section = [...resolved.sections.app, { key: "f", cmd: fn }, { key: "x" }] satisfies Binding[]
    resolved.sections.app = section

    expect(resolved.omit("app", ["app.second", "missing", " app.exact "])).toEqual([
      { key: "1", cmd: "app.first" },
      { key: "3", cmd: "app.third" },
      { key: "4", cmd: "app.exact" },
      { key: "f", cmd: fn },
      { key: "x" },
    ])
    expect(resolved.omit("app", ["app.exact"])).toEqual([
      { key: "1", cmd: "app.first" },
      { key: "2a", cmd: "app.second" },
      { key: "2b", cmd: "app.second", preventDefault: false },
      { key: "3", cmd: "app.third" },
      { key: "f", cmd: fn },
      { key: "x" },
    ])
    expect(resolved.omit("app", [])).toEqual(section)
    expect(resolved.omit("app", [])).not.toBe(section)
    expect(resolved.omit("missing", ["first"])).toEqual([])
  })

  test("can return a complete empty section shape for empty config", () => {
    const resolved = resolveBindingSections(
      {},
      {
        sections: ["app", "prompt", "dialog_select"],
      },
    )

    expect(resolved.sections).toEqual({
      app: [],
      prompt: [],
      dialog_select: [],
    })
    expect(resolved.get("app", "save")).toBeUndefined()
    expect(resolved.get("prompt", "submit")).toBeUndefined()
    expect(resolved.get("missing", "submit")).toBeUndefined()
  })

  test("uses section command keys as the binding command identity", () => {
    const resolved = resolveBindingSections({
      "app.exit": {
        key: "q",
        cmd: "ignored.command",
        preventDefault: false,
      },
    })

    expect(resolved.sections.app).toEqual([{ key: "q", cmd: "app.exit", preventDefault: false }])
    expect(resolved.get("app", "ignored.command")).toBeUndefined()
  })

  test("clones key and binding objects without mutating inputs", () => {
    const key = { name: "s", ctrl: true }
    const binding = {
      key,
      cmd: "ignored.command",
      preventDefault: false,
      metadata: { source: "user" },
    }

    const resolved = resolveBindingSections({
      "app.save": binding,
    })
    const resolvedBinding = resolved.sections.app?.[0]

    expect(resolvedBinding).toEqual({
      key: { name: "s", ctrl: true },
      cmd: "app.save",
      preventDefault: false,
      metadata: { source: "user" },
    })
    expect(resolvedBinding).not.toBe(binding)
    expect(resolvedBinding?.key).not.toBe(key)
    expect(binding.cmd).toBe("ignored.command")
  })

  test("applies binding defaults without overriding explicit binding fields", () => {
    const key = { name: "s", ctrl: true }
    const binding = {
      key,
      desc: "Explicit description",
      group: "Explicit group",
      preventDefault: true,
    }
    const calls: string[] = []

    const resolved = resolveBindingSections(
      {
        "app.save": binding,
        "app.open": "o",
        "app.multi": ["m", { key: "shift+m", group: "Explicit multi group" }],
        "app.disabled": false,
        "app.empty": [],
      },
      {
        bindingDefaults({ section, command, binding }) {
          calls.push(`${section}:${command}:${String(binding.key)}`)
          return {
            key: "ignored-key",
            cmd: "ignored-command",
            desc: "Default description",
            group: "Default group",
            preventDefault: false,
          }
        },
      },
    )

    expect(calls).toEqual([
      "app:app.save:[object Object]",
      "app:app.open:o",
      "app:app.multi:m",
      "app:app.multi:shift+m",
    ])
    expect(resolved.sections.app).toEqual([
      {
        key: { name: "s", ctrl: true },
        cmd: "app.save",
        desc: "Explicit description",
        group: "Explicit group",
        preventDefault: true,
      },
      {
        key: "o",
        cmd: "app.open",
        desc: "Default description",
        group: "Default group",
        preventDefault: false,
      },
      {
        key: "m",
        cmd: "app.multi",
        desc: "Default description",
        group: "Default group",
        preventDefault: false,
      },
      {
        key: "shift+m",
        cmd: "app.multi",
        desc: "Default description",
        group: "Explicit multi group",
        preventDefault: false,
      },
    ])
    expect(binding).toEqual({
      key,
      desc: "Explicit description",
      group: "Explicit group",
      preventDefault: true,
    })
    expect(resolved.get("app", "app.open")).toEqual([
      {
        key: "o",
        cmd: "app.open",
        desc: "Default description",
        group: "Default group",
        preventDefault: false,
      },
    ])
    expect(resolved.pick("app", ["app.multi"]).map((item) => item.group)).toEqual([
      "Default group",
      "Explicit multi group",
    ])
    expect(resolved.omit("app", ["app.multi"]).map((item) => item.group)).toEqual(["Explicit group", "Default group"])
  })

  test("lets false, none, and empty arrays disable a command and lets later normalized entries replace earlier ones", () => {
    const resolved = resolveBindingSections({
      " app.save ": "x",
      "app.save": false,
      "app.disabled": "none",
      "app.literal_none_key": ["none"],
      "app.open ": "o",
      "app.open": ["p", { key: "shift+p", preventDefault: false }],
      "app.empty": [],
    })

    expect(resolved.sections.app).toEqual([
      { key: "none", cmd: "app.literal_none_key" },
      { key: "p", cmd: "app.open" },
      { key: "shift+p", cmd: "app.open", preventDefault: false },
    ])
    expect(resolved.get("app", "app.save")).toBeUndefined()
    expect(resolved.get("app", "app.disabled")).toBeUndefined()
    expect(resolved.get("app", "app.literal_none_key")).toEqual([{ key: "none", cmd: "app.literal_none_key" }])
    expect(resolved.get("app", "app.open")).toEqual([
      { key: "p", cmd: "app.open" },
      { key: "shift+p", cmd: "app.open", preventDefault: false },
    ])
    expect(resolved.get("app", " app.open ")).toEqual([
      { key: "p", cmd: "app.open" },
      { key: "shift+p", cmd: "app.open", preventDefault: false },
    ])
    expect(resolved.get("app", "app.empty")).toBeUndefined()
  })

  test("preserves empty sections when every command is disabled", () => {
    const resolved = resolveBindingSections({
      "app.save": false,
      "app.open": "none",
      "app.close": [],
    })

    expect(resolved.sections.app).toEqual([])
    expect(resolved.get("app", "app.save")).toBeUndefined()
    expect(resolved.get("app", "app.open")).toBeUndefined()
    expect(resolved.get("app", "app.close")).toBeUndefined()
  })

  test("re-adds normalized commands after disables at the latest insertion point", () => {
    const app: Record<string, BindingValue> = {}
    app[" app.action "] = "a"
    app["app.action"] = false
    app["app.before_action"] = "b"
    app["app.action "] = "c"

    const resolved = resolveBindingSections(app)

    expect(resolved.sections.app).toEqual([
      { key: "b", cmd: "app.before_action" },
      { key: "c", cmd: "app.action" },
    ])
    expect(resolved.get("app", " app.action ")).toEqual([{ key: "c", cmd: "app.action" }])
  })

  test("ignores inherited section and command properties", () => {
    const config = Object.create({ "app.inherited": "i" }) as Record<string, unknown>
    config["app.save"] = "s"

    const resolved = resolveBindingSections(config as never)

    expect(Object.keys(resolved.sections)).toEqual(["app"])
    expect(resolved.sections.app).toEqual([{ key: "s", cmd: "app.save" }])
    expect(resolved.get("app", "app.inherited")).toBeUndefined()
  })

  test("throws for invalid commands and binding values", () => {
    expect(() => resolveBindingSections({ app: false } as never)).toThrow(
      'Invalid binding command "app": expected a dot-delimited command name with a section prefix',
    )
    expect(() => resolveBindingSections({ ".save": "s" } as never)).toThrow(
      'Invalid binding command ".save": expected a dot-delimited command name with a section prefix',
    )
    expect(() => resolveBindingSections({ "app.": "s" } as never)).toThrow(
      'Invalid binding command "app.": expected a dot-delimited command name with a section prefix',
    )
    expect(() => resolveBindingSections({ "   ": "s" } as never)).toThrow(
      'Invalid binding command "": expected a dot-delimited command name with a section prefix',
    )
    expect(() => resolveBindingSections({ "app.save": true } as never)).toThrow(
      'Invalid binding value for "app.save": expected false, a key, a binding object, or an array of keys/binding objects',
    )
    expect(() => resolveBindingSections({ "app.save": null } as never)).toThrow(
      'Invalid binding value for "app.save": expected false, a key, a binding object, or an array of keys/binding objects',
    )
    expect(() => resolveBindingSections({ "app.save": ["x", true] } as never)).toThrow(
      'Invalid binding value for "app.save" at index 1: expected false, a key, a binding object, or an array of keys/binding objects',
    )
    expect(() => resolveBindingSections({ "app.save": ["x", false] } as never)).toThrow(
      'Invalid binding value for "app.save" at index 1: expected false, a key, a binding object, or an array of keys/binding objects',
    )
    expect(() => resolveBindingSections({ "app.save": { key: true } } as never)).toThrow(
      'Invalid binding value for "app.save": expected false, a key, a binding object, or an array of keys/binding objects',
    )
  })

  test("supports registering resolved section bindings", async () => {
    const harness = createTestKeymap({ defaultKeys: true })
    const { keymap, host } = harness
    const calls: string[] = []

    try {
      keymap.registerLayer({
        commands: [
          {
            name: "app.exit",
            run() {
              calls.push("exit")
            },
          },
          {
            name: "prompt.paste",
            run() {
              calls.push("paste")
            },
          },
        ],
      })

      const resolved = resolveBindingSections({
        "app.exit": ["q", "ctrl+c"],
        "prompt.paste": {
          key: "p",
          preventDefault: false,
        },
      })

      keymap.registerLayer({ bindings: resolved.sections.app })
      keymap.registerLayer({ bindings: resolved.sections.prompt })

      host.press("q")
      host.press("p")

      expect(calls).toEqual(["exit", "paste"])
    } finally {
      harness.cleanup()
    }
  })
})
