import { appendFileSync } from "node:fs"

const enabled = process.env.OPENTUI_DEBUG_CULLING === "1"
const outputFile = process.env.OPENTUI_DEBUG_CULLING_FILE
const parsedLimit = Number(process.env.OPENTUI_DEBUG_CULLING_LIMIT)
const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50_000
let sequence = 0
let limitReported = false
let outputErrorReported = false

function write(line: string): void {
  if (!outputFile) {
    console.error(line)
    return
  }

  try {
    appendFileSync(outputFile, `${line}\n`)
  } catch (error) {
    if (!outputErrorReported) {
      outputErrorReported = true
      console.error(`[opentui:culling] failed to write ${outputFile}:`, error)
    }
  }
}

export function isCullingDebugEnabled(): boolean {
  return enabled
}

export function cullingDebug(event: string, data: Record<string, unknown>): void {
  if (!enabled) return
  if (sequence >= limit) {
    if (!limitReported) {
      limitReported = true
      write(`[opentui:culling] ${JSON.stringify({ seq: sequence, event: "trace-limit", limit })}`)
    }
    return
  }

  write(
    `[opentui:culling] ${JSON.stringify({
      seq: sequence++,
      time: Number(performance.now().toFixed(3)),
      event,
      ...data,
    })}`,
  )
}
