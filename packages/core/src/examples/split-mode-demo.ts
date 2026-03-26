import {
  BoxRenderable,
  bold,
  createCliRenderer,
  fg,
  TextRenderable,
  t,
  type CliRenderer,
  type KeyEvent,
} from "../index.js"
import { setupCommonDemoKeys } from "./lib/standalone-keys.js"
import { createTimeline, type JSAnimation, Timeline } from "../animation/Timeline.js"

const DEFAULT_FOOTER_HEIGHT = 20
const MIN_FOOTER_HEIGHT = DEFAULT_FOOTER_HEIGHT
const MIN_MAIN_SCREEN_HEIGHT = 5
const DEFAULT_OUTPUT_INTERVAL = 100
const MIN_OUTPUT_INTERVAL = 5
const MAX_OUTPUT_INTERVAL = 1000

let text: TextRenderable | null = null
let instructionsText: TextRenderable | null = null
let keyHandler: ((key: KeyEvent) => void) | null = null
let outputTimer: ReturnType<typeof setInterval> | null = null
let animationSystem: SplitModeAnimations | null = null
let testOutputInterval = DEFAULT_OUTPUT_INTERVAL

function writeDemoOutput(message: string): void {
  process.stdout.write(`${message}\n`)
}

function clearOutputTimer(): void {
  if (!outputTimer) return
  clearInterval(outputTimer)
  outputTimer = null
}

function getMaxFooterHeight(renderer: CliRenderer): number {
  return Math.max(1, renderer.terminalHeight - MIN_MAIN_SCREEN_HEIGHT)
}

function clampFooterHeight(renderer: CliRenderer, footerHeight: number): number {
  const maxFooterHeight = getMaxFooterHeight(renderer)
  const minFooterHeight = Math.min(MIN_FOOTER_HEIGHT, maxFooterHeight)

  return Math.min(Math.max(footerHeight, minFooterHeight), maxFooterHeight)
}

class SplitModeAnimations {
  private timeline: Timeline
  private renderer: CliRenderer
  private container: BoxRenderable

  private systemLoadingBars: BoxRenderable[] = []
  private movingOrbs: BoxRenderable[] = []
  private statusCounters: TextRenderable[] = []
  private pulsingElements: BoxRenderable[] = []

  private systemProgress = { cpu: 0, memory: 0, network: 0, disk: 0 }
  private counters = { packets: 0, connections: 0, processes: 0, uptime: 0 }
  private orbPositions = [
    { x: 2, y: 2 },
    { x: 15, y: 3 },
    { x: 30, y: 2 },
  ]

  constructor(renderer: CliRenderer) {
    this.renderer = renderer
    this.timeline = createTimeline({
      duration: 8000,
      loop: true,
    })

    this.container = new BoxRenderable(renderer, {
      id: "animation-container",
      zIndex: 5,
    })
    this.renderer.root.add(this.container)

    this.setupUI()
    this.setupAnimations()
    this.timeline.play()
  }

  private setupUI(): void {
    const statusPanel = new BoxRenderable(this.renderer, {
      id: "status-panel",
      position: "absolute",
      left: 2,
      top: 5,
      width: this.renderer.width - 6,
      height: 8,
      backgroundColor: "#1a1a2e",
      zIndex: 1,
      borderStyle: "double",
      borderColor: "#4a4a6a",
      title: "◆ SYSTEM MONITOR ◆",
      titleAlignment: "center",
      border: true,
    })
    this.container.add(statusPanel)

    this.systemLoadingBars = []
    const systems = [
      { name: "CPU", color: "#6a5acd", y: 6 },
      { name: "MEM", color: "#4682b4", y: 7 },
      { name: "NET", color: "#20b2aa", y: 8 },
      { name: "DSK", color: "#daa520", y: 9 },
    ]

    systems.forEach((system, index) => {
      const label = new TextRenderable(this.renderer, {
        id: `${system.name.toLowerCase()}-label`,
        content: `${system.name}:`,
        position: "absolute",
        left: 4,
        top: system.y,
        fg: system.color,
        zIndex: 2,
      })
      this.container.add(label)

      const bgBar = new BoxRenderable(this.renderer, {
        id: `${system.name.toLowerCase()}-bg`,
        position: "absolute",
        left: 9,
        top: system.y,
        width: this.renderer.width - 16,
        height: 1,
        backgroundColor: "#333333",
        zIndex: 1,
      })
      this.container.add(bgBar)

      const progressBar = new BoxRenderable(this.renderer, {
        id: `${system.name.toLowerCase()}-progress`,
        position: "absolute",
        left: 9,
        top: system.y,
        width: 1,
        height: 1,
        backgroundColor: system.color,
        zIndex: 2,
      })
      this.container.add(progressBar)
      this.systemLoadingBars.push(progressBar)
    })

    const statsPanel = new BoxRenderable(this.renderer, {
      id: "stats-panel",
      position: "absolute",
      left: 2,
      top: 14,
      width: this.renderer.width - 6,
      height: 4,
      backgroundColor: "#2d1b2e",
      zIndex: 1,
      borderStyle: "single",
      borderColor: "#8a4a8a",
      title: "◇ REAL-TIME STATS ◇",
      titleAlignment: "center",
      border: true,
    })
    this.container.add(statsPanel)

    this.statusCounters = []
    const counterLabels = ["PACKETS", "CONNECTIONS", "PROCESSES", "UPTIME"]
    counterLabels.forEach((label, index) => {
      const counter = new TextRenderable(this.renderer, {
        id: `counter-${index}`,
        content: `${label}: 0`,
        position: "absolute",
        left: 4 + index * 15,
        top: 15,
        fg: "#9a9acd",
        zIndex: 2,
      })
      this.container.add(counter)
      this.statusCounters.push(counter)
    })

    this.movingOrbs = []
    const orbColors = ["#ff6b9d", "#4ecdc4", "#ffe66d"]
    orbColors.forEach((color, index) => {
      const orb = new BoxRenderable(this.renderer, {
        id: `orb-${index}`,
        position: "absolute",
        left: 2,
        top: this.orbPositions[index].y,
        width: 3,
        height: 1,
        backgroundColor: color,
        zIndex: 3,
      })
      this.container.add(orb)
      this.movingOrbs.push(orb)
    })

    this.pulsingElements = []
    const pulseColors = ["#ff8a80", "#80cbc4", "#fff176"]
    pulseColors.forEach((color, index) => {
      const pulse = new BoxRenderable(this.renderer, {
        id: `pulse-${index}`,
        position: "absolute",
        left: this.renderer.width - 8 + index * 2,
        top: 1,
        width: 1,
        height: 1,
        backgroundColor: color,
        zIndex: 3,
      })
      this.container.add(pulse)
      this.pulsingElements.push(pulse)
    })
  }

  private updateSystemBars(progress: typeof this.systemProgress): void {
    const maxWidth = this.renderer.width - 16
    const barValues = [progress.cpu, progress.memory, progress.network, progress.disk]

    barValues.forEach((value, index) => {
      this.systemLoadingBars[index].width = Math.max(1, Math.floor((value / 100) * maxWidth))
    })
  }

  private updateStatusCounters(counters: typeof this.counters): void {
    const counterValues = [
      `PACKETS: ${Math.floor(counters.packets)}`,
      `CONN: ${Math.floor(counters.connections)}`,
      `PROC: ${Math.floor(counters.processes)}`,
      `UP: ${Math.floor(counters.uptime)}s`,
    ]

    counterValues.forEach((value, index) => {
      this.statusCounters[index].content = value
    })
  }

  private updateOrbPosition(index: number, position: { x: number }): void {
    this.movingOrbs[index].x = Math.floor(position.x)
  }

  private updatePulseHeight(index: number, intensity: number): void {
    const height = Math.max(1, Math.floor(intensity))
    this.pulsingElements[index].height = Math.min(3, height)
  }

  private setupAnimations(): void {
    this.timeline.add(
      this.systemProgress,
      {
        cpu: 85,
        memory: 70,
        network: 95,
        disk: 60,
        duration: 3000,
        ease: "inOutQuad",
        onUpdate: (values: JSAnimation) => {
          this.updateSystemBars(values.targets[0])
        },
      },
      0,
    )

    this.timeline.add(
      this.systemProgress,
      {
        cpu: 20,
        memory: 30,
        network: 15,
        disk: 25,
        duration: 2000,
        ease: "inOutSine",
        onUpdate: (values: JSAnimation) => {
          this.updateSystemBars(values.targets[0])
        },
      },
      4000,
    )

    this.timeline.add(
      this.counters,
      {
        packets: 12847,
        connections: 234,
        processes: 187,
        uptime: 86400,
        duration: 8000,
        ease: "linear",
        onUpdate: (values: JSAnimation) => {
          this.updateStatusCounters(values.targets[0])
        },
      },
      0,
    )

    this.orbPositions.forEach((orbPos, index) => {
      this.timeline.add(
        orbPos,
        {
          x: this.renderer.width - 10,
          duration: 2000 + index * 400,
          ease: "inOutSine",
          onUpdate: (values: JSAnimation) => {
            this.updateOrbPosition(index, values.targets[0])
          },
        },
        index * 800,
      )

      this.timeline.add(
        orbPos,
        {
          x: 2,
          duration: 2000 + index * 400,
          ease: "inOutSine",
          onUpdate: (values: JSAnimation) => {
            this.updateOrbPosition(index, values.targets[0])
          },
        },
        4000 + index * 800,
      )
    })

    this.pulsingElements.forEach((_, index) => {
      const pulseData = { intensity: 1.0 }
      this.timeline.add(
        pulseData,
        {
          intensity: 3.0,
          duration: 1000,
          ease: "inOutQuad",
          loop: 8,
          alternate: true,
          onUpdate: (values: JSAnimation) => {
            this.updatePulseHeight(index, values.targets[0].intensity)
          },
        },
        index * 300,
      )
    })
  }

  public update(deltaTime: number): void {
    this.timeline.update(deltaTime)
  }

  public destroy(): void {
    this.timeline.pause()
    this.renderer.root.remove("animation-container")
  }
}

export function run(rendererInstance: CliRenderer): void {
  rendererInstance.setBackgroundColor("#001122")
  rendererInstance.footerHeight = clampFooterHeight(rendererInstance, DEFAULT_FOOTER_HEIGHT)
  rendererInstance.screenMode = "split-footer"
  rendererInstance.externalOutputMode = "capture-stdout"

  animationSystem = new SplitModeAnimations(rendererInstance)

  text = new TextRenderable(rendererInstance, {
    id: "demo-text",
    position: "absolute",
    left: 2,
    top: 0,
    width: rendererInstance.width - 4,
    height: 2,
    zIndex: 10,
    content: t`${bold(fg("#00ffff")("◆ SPLIT MODE DEMO - ANIMATED DASHBOARD ◆"))}`,
  })

  instructionsText = new TextRenderable(rendererInstance, {
    id: "split-mode-instructions",
    position: "absolute",
    left: 2,
    bottom: 0,
    width: rendererInstance.width - 4,
    height: 2,
    zIndex: 10,
    content: "",
  })

  rendererInstance.root.add(text)
  rendererInstance.root.add(instructionsText)

  rendererInstance.setFrameCallback(async (deltaTime: number) => {
    animationSystem?.update(deltaTime)
  })

  const isCapturingOutput = () =>
    rendererInstance.screenMode === "split-footer" && rendererInstance.externalOutputMode === "capture-stdout"

  const updateInstructions = () => {
    if (!instructionsText) return

    const modeLabel =
      rendererInstance.screenMode === "split-footer" ? `footer ${rendererInstance.footerHeight}` : "fullscreen"
    const outputLabel = isCapturingOutput() ? `${testOutputInterval}ms` : "paused"
    const mouseLabel = rendererInstance.useMouse ? "on" : "off"

    instructionsText.content = t`${bold(
      fg("#cccccc")(
        `[+/-] Height ${rendererInstance.footerHeight} | [0] Mode ${modeLabel} | [M/L] Output ${outputLabel} | [U] Mouse ${mouseLabel}`,
      ),
    )}`
  }

  const writeCapturedOutput = (message: string) => {
    if (!isCapturingOutput()) return
    writeDemoOutput(message)
  }

  let messageCount = 0

  const startTestOutput = () => {
    clearOutputTimer()
    if (!isCapturingOutput()) {
      updateInstructions()
      return
    }

    outputTimer = setInterval(() => {
      messageCount++
      writeDemoOutput(`Test output ${messageCount}: This should appear above the renderer and scroll naturally`)
    }, testOutputInterval)

    updateInstructions()
  }

  const enableSplitMode = () => {
    rendererInstance.footerHeight = clampFooterHeight(rendererInstance, rendererInstance.footerHeight)
    rendererInstance.screenMode = "split-footer"
    rendererInstance.externalOutputMode = "capture-stdout"
    startTestOutput()
    writeCapturedOutput(`Switched to split-footer mode (height ${rendererInstance.footerHeight})`)
  }

  const disableSplitMode = () => {
    writeCapturedOutput("Switched to main-screen mode (test output paused)")
    clearOutputTimer()
    rendererInstance.externalOutputMode = "passthrough"
    rendererInstance.screenMode = "main-screen"
    updateInstructions()
  }

  updateInstructions()

  writeDemoOutput("=== Split Mode Demo ===")
  writeDemoOutput(`Terminal size: ${rendererInstance.terminalWidth}x${rendererInstance.terminalHeight}`)
  writeDemoOutput(`Renderer split height: ${rendererInstance.footerHeight}`)
  writeDemoOutput(`Renderer offset: ${Math.max(rendererInstance.terminalHeight - rendererInstance.footerHeight, 0)}`)
  writeDemoOutput("Console output should appear here and scroll naturally")
  writeDemoOutput("The renderer should stay fixed at the bottom as a footer")
  writeDemoOutput(`Test output running at ${testOutputInterval}ms intervals (use M/L to adjust speed)`)
  writeDemoOutput(`Mouse functionality: ${rendererInstance.useMouse ? "enabled" : "disabled"} (use U to toggle)`)

  startTestOutput()

  keyHandler = (key) => {
    switch (key.name?.toLowerCase()) {
      case "+": {
        const newHeight = clampFooterHeight(rendererInstance, rendererInstance.footerHeight + 1)
        if (newHeight === rendererInstance.footerHeight) break
        rendererInstance.footerHeight = newHeight
        updateInstructions()
        writeCapturedOutput(`Split height increased to ${newHeight}`)
        break
      }
      case "-": {
        const newHeight = clampFooterHeight(rendererInstance, rendererInstance.footerHeight - 1)
        if (newHeight === rendererInstance.footerHeight) break
        rendererInstance.footerHeight = newHeight
        updateInstructions()
        writeCapturedOutput(`Split height decreased to ${newHeight}`)
        break
      }
      case "0": {
        if (rendererInstance.screenMode === "split-footer") {
          disableSplitMode()
        } else {
          enableSplitMode()
        }
        break
      }
      case "m": {
        const nextInterval = Math.max(MIN_OUTPUT_INTERVAL, testOutputInterval - 5)
        if (nextInterval === testOutputInterval) break
        testOutputInterval = nextInterval
        startTestOutput()
        writeCapturedOutput(`Test output speed increased (interval: ${testOutputInterval}ms)`)
        break
      }
      case "l": {
        const nextInterval = Math.min(MAX_OUTPUT_INTERVAL, testOutputInterval + 5)
        if (nextInterval === testOutputInterval) break
        testOutputInterval = nextInterval
        startTestOutput()
        writeCapturedOutput(`Test output speed decreased (interval: ${testOutputInterval}ms)`)
        break
      }
      case "u": {
        rendererInstance.useMouse = !rendererInstance.useMouse
        updateInstructions()
        writeCapturedOutput(`Mouse functionality ${rendererInstance.useMouse ? "enabled" : "disabled"}`)
        break
      }
    }
  }

  rendererInstance.keyInput.on("keypress", keyHandler)
}

export function destroy(rendererInstance: CliRenderer): void {
  if (keyHandler) {
    rendererInstance.keyInput.off("keypress", keyHandler)
    keyHandler = null
  }

  clearOutputTimer()

  if (animationSystem) {
    animationSystem.destroy()
    animationSystem = null
  }

  if (text) {
    rendererInstance.root.remove(text.id)
    text = null
  }

  if (instructionsText) {
    rendererInstance.root.remove(instructionsText.id)
    instructionsText = null
  }

  rendererInstance.clearFrameCallbacks()
  rendererInstance.externalOutputMode = "passthrough"
  rendererInstance.screenMode = "main-screen"
}

if (import.meta.main) {
  const renderer = await createCliRenderer({
    targetFps: 30,
    exitOnCtrlC: true,
    useMouse: true,
    screenMode: "split-footer",
    footerHeight: DEFAULT_FOOTER_HEIGHT,
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
  })

  run(renderer)
  setupCommonDemoKeys(renderer)
  renderer.start()
}
