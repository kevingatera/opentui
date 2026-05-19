import {
  BoxRenderable,
  CliRenderEvents,
  TextRenderable,
  createCliRenderer,
  type CliRenderer,
  type KeyEvent,
  type SplitFooterResizeResetEvent,
} from "@opentui/core"
import { setupCommonDemoKeys } from "./lib/standalone-keys.js"

const FOOTER_HEIGHT = 8
const RESIZE_DEBOUNCE_MS = 250
const HEARTBEAT_INTERVAL_MS = 400

class SplitResizeResetDemo {
  private shell: BoxRenderable
  private titleText: TextRenderable
  private stateText: TextRenderable
  private counterText: TextRenderable
  private lastEventText: TextRenderable
  private noteText: TextRenderable
  private helpText: TextRenderable

  private readonly previousDebounceDelay: number
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private destroyed = false
  private heartbeatEnabled = true
  private resizeResetLogEnabled = true
  private heartbeatCount = 0
  private resizeBurstCount = 0
  private resizeEventCount = 0
  private lastResizeSummary = "none"
  private lastResizeEvent = "waiting for resize"

  constructor(private renderer: CliRenderer) {
    this.previousDebounceDelay = this.renderer.debounceDelay
    this.renderer.debounceDelay = RESIZE_DEBOUNCE_MS

    if (this.renderer.screenMode !== "split-footer") {
      this.renderer.screenMode = "split-footer"
    }

    this.renderer.footerHeight = FOOTER_HEIGHT

    if (this.renderer.externalOutputMode !== "capture-stdout") {
      this.renderer.externalOutputMode = "capture-stdout"
    }

    this.renderer.setBackgroundColor("#071018")

    this.shell = new BoxRenderable(this.renderer, {
      id: "split-resize-reset-shell",
      width: "100%",
      height: "100%",
      border: ["top"],
      borderColor: "#2d5b89",
      backgroundColor: "#0d1723",
      paddingTop: 1,
      paddingBottom: 0,
      paddingLeft: 1,
      paddingRight: 1,
      gap: 0,
      flexDirection: "column",
    })

    this.titleText = new TextRenderable(this.renderer, {
      id: "split-resize-reset-title",
      width: "100%",
      height: 1,
      content: "Split Resize Reset Demo",
      fg: "#f4f8ff",
      attributes: 1,
    })

    this.stateText = new TextRenderable(this.renderer, {
      id: "split-resize-reset-state",
      width: "100%",
      height: 1,
      content: "",
      fg: "#9fc7f2",
    })

    this.counterText = new TextRenderable(this.renderer, {
      id: "split-resize-reset-counters",
      width: "100%",
      height: 1,
      content: "",
      fg: "#9fc7f2",
    })

    this.lastEventText = new TextRenderable(this.renderer, {
      id: "split-resize-reset-last-event",
      width: "100%",
      height: 1,
      content: "",
      fg: "#f8d38a",
    })

    this.noteText = new TextRenderable(this.renderer, {
      id: "split-resize-reset-note",
      width: "100%",
      height: 1,
      content: "Drag resize. Footer should blank during drag, then logs appear after 250ms settle.",
      fg: "#dbe7f5",
    })

    this.helpText = new TextRenderable(this.renderer, {
      id: "split-resize-reset-help",
      width: "100%",
      height: 1,
      content: "space manual stdout line | s heartbeat on/off | d resize logs on/off | common demo keys still work",
      fg: "#7da0c5",
    })

    this.shell.add(this.titleText)
    this.shell.add(this.stateText)
    this.shell.add(this.counterText)
    this.shell.add(this.lastEventText)
    this.shell.add(this.noteText)
    this.shell.add(this.helpText)
    this.renderer.root.add(this.shell)

    this.renderer.keyInput.on("keypress", this.handleKeyPress)
    this.renderer.on(CliRenderEvents.SPLIT_FOOTER_RESIZE_RESET, this.handleResizeReset)
    this.renderer.on(CliRenderEvents.RESIZE, this.handleResize)
    this.renderer.on(CliRenderEvents.DESTROY, this.handleRendererDestroy)

    this.refreshFooter()
    this.writeCapturedLine(
      `demo ready -> reset policy active, debounce ${this.renderer.debounceDelay}ms, footer ${this.renderer.footerHeight}`,
    )
    this.writeCapturedLine("drag the terminal size now; heartbeat stdout lines should buffer during resize bursts")
    this.syncHeartbeat()
  }

  private isSplitCaptureMode(): boolean {
    return this.renderer.screenMode === "split-footer" && this.renderer.externalOutputMode === "capture-stdout"
  }

  private timestamp(): string {
    const date = new Date()
    const hh = String(date.getHours()).padStart(2, "0")
    const mm = String(date.getMinutes()).padStart(2, "0")
    const ss = String(date.getSeconds()).padStart(2, "0")
    return `${hh}:${mm}:${ss}`
  }

  private writeCapturedLine(message: string): void {
    if (this.destroyed || !this.isSplitCaptureMode()) {
      return
    }

    process.stdout.write(`[${this.timestamp()}] ${message}\n`)
  }

  private refreshFooter(): void {
    if (this.destroyed) {
      return
    }

    this.stateText.content =
      `tty ${this.renderer.terminalWidth}x${this.renderer.terminalHeight} | render ${this.renderer.width}x${this.renderer.height} | ` +
      `footer ${this.renderer.footerHeight} | debounce ${this.renderer.debounceDelay}ms`
    this.counterText.content =
      `bursts ${this.resizeBurstCount} | reset-events ${this.resizeEventCount} | resize-logs ${this.resizeResetLogEnabled ? "on" : "off"} | ` +
      `heartbeat ${this.heartbeatEnabled ? `on/${HEARTBEAT_INTERVAL_MS}ms` : "off"} | ticks ${this.heartbeatCount}`
    this.lastEventText.content = `last: ${this.lastResizeSummary} | resize: ${this.lastResizeEvent}`
  }

  private formatResizeResetEvent(event: SplitFooterResizeResetEvent): string {
    switch (event.phase) {
      case "burst-start":
        return [
          `burst-start target ${event.targetTerminalWidth}x${event.targetTerminalHeight}`,
          `clear row ${event.footerTopLine ?? 1}`,
          `scroll ${event.upperHeight ?? 0}`,
          `debounce ${event.debounceDelay}ms`,
          event.terminalCleared === false ? "clear skipped" : "cleared",
        ].join(" | ")
      case "burst-update":
        return [
          `burst-update latest ${event.targetTerminalWidth}x${event.targetTerminalHeight}`,
          `delta ${event.verticalDelta ?? 0}`,
          `scroll ${event.scrollLines ?? 0}`,
          `pending ${event.pendingOutputCommits ?? 0}`,
        ].join(" | ")
      case "settle":
        return [
          `settle applied ${event.targetTerminalWidth}x${event.targetTerminalHeight}`,
          `render ${event.renderWidth}x${event.renderHeight}`,
          `offset ${event.renderOffset}`,
          `repaint ${event.forcedFullRepaint ? "forced" : "normal"}`,
        ].join(" | ")
      case "cancel":
        return `cancel target ${event.targetTerminalWidth}x${event.targetTerminalHeight} | reason ${event.reason ?? "unknown"}`
    }
  }

  private syncHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    if (!this.heartbeatEnabled || this.destroyed) {
      return
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.destroyed || !this.isSplitCaptureMode()) {
        return
      }

      this.heartbeatCount += 1
      this.writeCapturedLine(
        `heartbeat ${this.heartbeatCount} -> stdout writes during drag should show up after settle`,
      )
      this.refreshFooter()
    }, HEARTBEAT_INTERVAL_MS)
  }

  private handleResizeReset = (event: SplitFooterResizeResetEvent): void => {
    if (this.destroyed) {
      return
    }

    this.resizeEventCount += 1
    if (event.phase === "burst-start") {
      this.resizeBurstCount += 1
    }

    this.lastResizeSummary = this.formatResizeResetEvent(event)
    if (this.resizeResetLogEnabled) {
      this.writeCapturedLine(`resize-reset ${this.lastResizeSummary}`)
    }
    this.refreshFooter()
  }

  private handleResize = (width: number, height: number): void => {
    if (this.destroyed) {
      return
    }

    this.lastResizeEvent = `${width}x${height}`
    this.refreshFooter()
  }

  private handleKeyPress = (key: KeyEvent): void => {
    if (key.name === "space") {
      key.preventDefault()
      this.writeCapturedLine("manual stdout line -> written immediately or buffered if resize reset is active")
      return
    }

    if (key.name?.toLowerCase() === "s") {
      key.preventDefault()
      this.heartbeatEnabled = !this.heartbeatEnabled
      this.syncHeartbeat()
      this.writeCapturedLine(`heartbeat ${this.heartbeatEnabled ? "enabled" : "disabled"}`)
      this.refreshFooter()
      return
    }

    if (key.name?.toLowerCase() === "d") {
      key.preventDefault()
      this.resizeResetLogEnabled = !this.resizeResetLogEnabled
      this.writeCapturedLine(`resize reset logs ${this.resizeResetLogEnabled ? "enabled" : "disabled"}`)
      this.refreshFooter()
    }
  }

  private handleRendererDestroy = (): void => {
    this.destroy()
  }

  public destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }

    this.renderer.keyInput.off("keypress", this.handleKeyPress)
    this.renderer.off(CliRenderEvents.SPLIT_FOOTER_RESIZE_RESET, this.handleResizeReset)
    this.renderer.off(CliRenderEvents.RESIZE, this.handleResize)
    this.renderer.off(CliRenderEvents.DESTROY, this.handleRendererDestroy)

    if (!this.shell.isDestroyed) {
      this.shell.destroyRecursively()
    }

    if (!this.renderer.isDestroyed) {
      this.renderer.debounceDelay = this.previousDebounceDelay
      this.renderer.externalOutputMode = "passthrough"
      this.renderer.screenMode = "main-screen"
    }
  }
}

let activeDemo: SplitResizeResetDemo | null = null

export function run(renderer: CliRenderer): void {
  if (activeDemo) {
    activeDemo.destroy()
  }

  activeDemo = new SplitResizeResetDemo(renderer)
}

export function destroy(_renderer: CliRenderer): void {
  if (!activeDemo) {
    return
  }

  activeDemo.destroy()
  activeDemo = null
}

if (import.meta.main) {
  const renderer = await createCliRenderer({
    targetFps: 30,
    debounceDelay: RESIZE_DEBOUNCE_MS,
    exitOnCtrlC: true,
    useMouse: false,
    screenMode: "split-footer",
    footerHeight: FOOTER_HEIGHT,
    externalOutputMode: "capture-stdout",
    consoleMode: "disabled",
  })

  run(renderer)
  setupCommonDemoKeys(renderer)
  renderer.start()
}
