import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"

import { capture } from "../console.ts"
import { clearEnvCache } from "../lib/env.ts"
import { createTestRenderer, type TestRenderer } from "../testing/test-renderer.js"
import { ManualClock } from "../testing/manual-clock.js"

let renderer: TestRenderer | null = null
let previousShowConsole: string | undefined
let previousUseAlternateScreen: string | undefined
let previousOverrideStdout: string | undefined
let previousUseConsole: string | undefined

beforeEach(() => {
  previousShowConsole = process.env.SHOW_CONSOLE
  previousUseAlternateScreen = process.env.OTUI_USE_ALTERNATE_SCREEN
  previousOverrideStdout = process.env.OTUI_OVERRIDE_STDOUT
  previousUseConsole = process.env.OTUI_USE_CONSOLE
  delete process.env.SHOW_CONSOLE
  delete process.env.OTUI_USE_ALTERNATE_SCREEN
  delete process.env.OTUI_OVERRIDE_STDOUT
  delete process.env.OTUI_USE_CONSOLE
  clearEnvCache()
})

afterEach(() => {
  renderer?.destroy()
  renderer = null
  capture.claimOutput()

  if (previousShowConsole === undefined) {
    delete process.env.SHOW_CONSOLE
  } else {
    process.env.SHOW_CONSOLE = previousShowConsole
  }

  if (previousUseAlternateScreen === undefined) {
    delete process.env.OTUI_USE_ALTERNATE_SCREEN
  } else {
    process.env.OTUI_USE_ALTERNATE_SCREEN = previousUseAlternateScreen
  }

  if (previousOverrideStdout === undefined) {
    delete process.env.OTUI_OVERRIDE_STDOUT
  } else {
    process.env.OTUI_OVERRIDE_STDOUT = previousOverrideStdout
  }

  if (previousUseConsole === undefined) {
    delete process.env.OTUI_USE_CONSOLE
  } else {
    process.env.OTUI_USE_CONSOLE = previousUseConsole
  }

  clearEnvCache()
})

test("CliRenderer initializes its clock before SHOW_CONSOLE triggers a render", async () => {
  process.env.SHOW_CONSOLE = "true"
  clearEnvCache()

  const result = await createTestRenderer({
    clock: new ManualClock(),
  })

  renderer = result.renderer

  expect(renderer).toBeDefined()
})

test("CliRenderer uses its shared clock for debounced resize", async () => {
  const clock = new ManualClock()
  const result = await createTestRenderer({
    width: 40,
    height: 20,
    clock,
  })

  renderer = result.renderer
  ;(renderer as any).handleResize(70, 30)

  expect(renderer.width).toBe(40)
  expect(renderer.height).toBe(20)

  clock.advance(99)

  expect(renderer.width).toBe(40)
  expect(renderer.height).toBe(20)

  clock.advance(1)

  expect(renderer.width).toBe(70)
  expect(renderer.height).toBe(30)
})

test("CliRenderer applies explicit screen and output modes", async () => {
  const result = await createTestRenderer({
    screenMode: "split-footer",
    footerHeight: 6,
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
  })

  renderer = result.renderer

  expect(renderer.screenMode).toBe("split-footer")
  expect(renderer.footerHeight).toBe(6)
  expect(renderer.externalOutputMode).toBe("capture-stdout")
  expect(renderer.consoleMode).toBe("disabled")
})

test("CliRenderer consoleMode disabled restores the original console", async () => {
  process.env.OTUI_USE_CONSOLE = "true"
  clearEnvCache()

  const originalConsole = global.console

  const result = await createTestRenderer({
    consoleMode: "console-overlay",
  })

  renderer = result.renderer

  expect(global.console).not.toBe(originalConsole)

  renderer.consoleMode = "disabled"

  expect(global.console).toBe(originalConsole)
})

test("CliRenderer clamps split footer height to terminal height at startup", async () => {
  const result = await createTestRenderer({
    width: 40,
    height: 5,
    screenMode: "split-footer",
    footerHeight: 12,
    externalOutputMode: "capture-stdout",
  })

  renderer = result.renderer

  expect(renderer.footerHeight).toBe(12)
  expect(renderer.height).toBe(5)
  expect((renderer as any)._splitHeight).toBe(5)
  expect((renderer as any).renderOffset).toBe(0)
})

test("CliRenderer rejects captured output outside split-footer mode", async () => {
  await expect(
    createTestRenderer({
      screenMode: "main-screen",
      externalOutputMode: "capture-stdout",
    }),
  ).rejects.toThrow('externalOutputMode "capture-stdout" requires screenMode "split-footer"')
})

test("CliRenderer flushes captured output before switching to passthrough in split-footer", async () => {
  const result = await createTestRenderer({
    screenMode: "split-footer",
    footerHeight: 6,
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
  })

  renderer = result.renderer
  const flushSpy = spyOn(renderer as any, "flushStdoutCache")

  ;(renderer as any).stdout.write("pending output\n")

  expect((renderer as any).externalOutputQueue.size).toBe(1)

  renderer.externalOutputMode = "passthrough"

  expect(flushSpy).toHaveBeenCalledTimes(1)
  expect((renderer as any).externalOutputQueue.size).toBe(0)
  flushSpy.mockRestore()
})

test("CliRenderer split-footer passthrough ignores console capture writes", async () => {
  const result = await createTestRenderer({
    screenMode: "split-footer",
    footerHeight: 6,
    externalOutputMode: "passthrough",
    consoleMode: "disabled",
  })

  renderer = result.renderer
  const requestRenderSpy = spyOn(renderer, "requestRender")

  capture.write("stdout", "from console capture\n")

  expect(requestRenderSpy).toHaveBeenCalledTimes(0)
  expect((renderer as any).externalOutputQueue.size).toBe(0)
  requestRenderSpy.mockRestore()
})

test("CliRenderer split-footer captures direct console writes when console mode is disabled", async () => {
  const result = await createTestRenderer({
    screenMode: "split-footer",
    footerHeight: 6,
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
  })

  renderer = result.renderer

  ;(renderer as any).stdout.write("direct write\n")

  expect((renderer as any).externalOutputQueue.claim()).toBe("direct write\n")
  expect(capture.size).toBe(0)
})

test("CliRenderer flushes captured output when leaving split-footer for alternate-screen", async () => {
  const result = await createTestRenderer({
    screenMode: "split-footer",
    footerHeight: 6,
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
    useThread: false,
  })

  renderer = result.renderer
  ;(renderer as any)._terminalIsSetup = true
  ;(renderer as any).lib.suspendRenderer = () => {}
  ;(renderer as any).lib.setupTerminal = () => {}

  ;(renderer as any).stdout.write("pending output\n")
  renderer.externalOutputMode = "passthrough"
  renderer.screenMode = "alternate-screen"

  expect((renderer as any).externalOutputQueue.size).toBe(0)
})

test("CliRenderer allows env to force main-screen mode", async () => {
  process.env.OTUI_USE_ALTERNATE_SCREEN = "false"
  clearEnvCache()

  const result = await createTestRenderer({
    screenMode: "alternate-screen",
  })

  renderer = result.renderer

  expect(renderer.screenMode).toBe("main-screen")
})

test("CliRenderer allows env to force alternate-screen mode", async () => {
  process.env.OTUI_USE_ALTERNATE_SCREEN = "true"
  clearEnvCache()

  const result = await createTestRenderer({
    screenMode: "main-screen",
  })

  renderer = result.renderer

  expect(renderer.screenMode).toBe("alternate-screen")
})

test("CliRenderer allows env to force passthrough stdout", async () => {
  process.env.OTUI_OVERRIDE_STDOUT = "false"
  clearEnvCache()

  const result = await createTestRenderer({
    screenMode: "split-footer",
    externalOutputMode: "capture-stdout",
  })

  renderer = result.renderer

  expect(renderer.externalOutputMode).toBe("passthrough")
})

test("CliRenderer allows env to force captured stdout in split-footer", async () => {
  process.env.OTUI_OVERRIDE_STDOUT = "true"
  clearEnvCache()

  const result = await createTestRenderer({
    screenMode: "split-footer",
    externalOutputMode: "passthrough",
  })

  renderer = result.renderer

  expect(renderer.externalOutputMode).toBe("capture-stdout")
})
