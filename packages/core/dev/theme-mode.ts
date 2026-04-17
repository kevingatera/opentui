#!/usr/bin/env bun
import { BoxRenderable, type CliRenderer, createCliRenderer, TextRenderable } from "../src/index.js"
import { parseColor } from "../src/lib/RGBA.js"

let renderer: CliRenderer | null = null
let themeText: TextRenderable | null = null
let statusText: TextRenderable | null = null
let eventCountText: TextRenderable | null = null
let historyText: TextRenderable | null = null
let themeModeEventCount = 0
const updateThemeHistory: string[] = []

function updateThemeDisplay() {
  if (!renderer || renderer.isDestroyed) return
  if (!themeText || !statusText || !eventCountText || !historyText) return

  const currentTheme = renderer.themeMode
  updateThemeHistory.push(`updateThemeDisplay ${updateThemeHistory.length + 1}: themeMode=${currentTheme ?? "null"}`)

  eventCountText.content = `theme_mode events: ${themeModeEventCount}`
  historyText.content = `updateThemeDisplay history:
${updateThemeHistory.join("\n")}`

  if (currentTheme === "dark") {
    themeText.content = "🌙 Dark Mode"
    themeText.fg = parseColor("#A5D6FF")
    statusText.content = "Terminal is in dark mode"
    renderer.setBackgroundColor("#1a1a2e")
  } else if (currentTheme === "light") {
    themeText.content = "☀️ Light Mode"
    themeText.fg = parseColor("#FF7B72")
    statusText.content = "Terminal is in light mode"
    renderer.setBackgroundColor("#f5f5f0")
  } else {
    themeText.content = "❓ Unknown"
    themeText.fg = parseColor("#FFA500")
    statusText.content = "Theme mode not detected. Try switching your terminal theme."
    renderer.setBackgroundColor("#2d2d2d")
  }
}

async function main() {
  renderer = await createCliRenderer({
    exitOnCtrlC: true,
    targetFps: 30,
  })

  const mainContainer = new BoxRenderable(renderer, {
    id: "main-container",
    flexGrow: 1,
    flexDirection: "column",
    padding: 2,
  })

  renderer.root.add(mainContainer)

  const titleText = new TextRenderable(renderer, {
    id: "title",
    content: "Theme Mode Monitor",
    bold: true,
    fg: parseColor("#6BCF7F"),
    marginBottom: 2,
  })

  themeText = new TextRenderable(renderer, {
    id: "theme-display",
    content: "Detecting...",
    bold: true,
    marginBottom: 1,
  })

  statusText = new TextRenderable(renderer, {
    id: "status",
    content: "Waiting for theme detection...",
    dim: true,
    marginBottom: 2,
  })

  eventCountText = new TextRenderable(renderer, {
    id: "event-count",
    content: "theme_mode events: 0",
    dim: true,
    marginBottom: 2,
  })

  historyText = new TextRenderable(renderer, {
    id: "history",
    content: "updateThemeDisplay history:\n(none)",
    dim: true,
    marginBottom: 2,
  })

  const helpText = new TextRenderable(renderer, {
    id: "help",
    content: "Press Ctrl+C to exit. Try switching your terminal's light/dark theme to see updates.",
    dim: true,
    fg: parseColor("#888888"),
  })

  mainContainer.add(titleText)
  mainContainer.add(themeText)
  mainContainer.add(statusText)
  mainContainer.add(eventCountText)
  mainContainer.add(historyText)
  mainContainer.add(helpText)

  // Initial display
  updateThemeDisplay()

  // Listen for theme mode changes from the terminal
  renderer.on("theme_mode", () => {
    themeModeEventCount++
    updateThemeDisplay()
  })

  renderer.requestRender()
}

main().catch((err) => {
  console.error("Error:", err)
  process.exit(1)
})
