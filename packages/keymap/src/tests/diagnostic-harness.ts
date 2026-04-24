import { expect } from "bun:test"
import type { ErrorEvent, Keymap, KeymapEvent, WarningEvent } from "../index.js"

export interface DiagnosticCapture {
  warnings: string[]
  errors: string[]
  warningEvents: WarningEvent[]
  errorEvents: ErrorEvent[]
  externalWarningListeners: number
  externalErrorListeners: number
  takeWarnings(): { warnings: string[]; warningEvents: WarningEvent[] }
  takeErrors(): { errors: string[]; errorEvents: ErrorEvent[] }
}

export interface DiagnosticHarness {
  trackKeymap<TTarget extends object, TEvent extends KeymapEvent, TKeymap extends Keymap<TTarget, TEvent>>(
    keymap: TKeymap,
  ): TKeymap
  captureDiagnostics<TTarget extends object, TEvent extends KeymapEvent>(
    keymap: Keymap<TTarget, TEvent>,
  ): DiagnosticCapture
  assertNoUnhandledDiagnostics(): void
}

export function createDiagnosticHarness(): DiagnosticHarness {
  const tracked = new WeakMap<Keymap<object, KeymapEvent>, DiagnosticCapture>()
  const captures = new Set<DiagnosticCapture>()

  const ensureCapture = <TTarget extends object, TEvent extends KeymapEvent>(
    keymap: Keymap<TTarget, TEvent>,
  ): DiagnosticCapture => {
    const existing = tracked.get(keymap as unknown as Keymap<object, KeymapEvent>)
    if (existing) {
      return existing
    }

    const warnings: string[] = []
    const errors: string[] = []
    const warningEvents: WarningEvent[] = []
    const errorEvents: ErrorEvent[] = []

    const originalOn = keymap.on.bind(keymap)

    originalOn("warning", (event) => {
      warnings.push(event.message)
      warningEvents.push(event)
    })
    originalOn("error", (event) => {
      errors.push(event.message)
      errorEvents.push(event)
    })

    const capture: DiagnosticCapture = {
      warnings,
      errors,
      warningEvents,
      errorEvents,
      externalWarningListeners: 0,
      externalErrorListeners: 0,
      takeWarnings() {
        const snapshot = {
          warnings: [...warnings],
          warningEvents: [...warningEvents],
        }
        warnings.length = 0
        warningEvents.length = 0
        return snapshot
      },
      takeErrors() {
        const snapshot = {
          errors: [...errors],
          errorEvents: [...errorEvents],
        }
        errors.length = 0
        errorEvents.length = 0
        return snapshot
      },
    }

    ;(keymap as { on: typeof keymap.on }).on = ((name: string, fn: unknown) => {
      if (name === "warning") {
        capture.externalWarningListeners += 1
      }

      if (name === "error") {
        capture.externalErrorListeners += 1
      }

      const off = originalOn(name as never, fn as never)
      return () => {
        if (name === "warning") {
          capture.externalWarningListeners = Math.max(capture.externalWarningListeners - 1, 0)
        }

        if (name === "error") {
          capture.externalErrorListeners = Math.max(capture.externalErrorListeners - 1, 0)
        }

        off()
      }
    }) as typeof keymap.on

    tracked.set(keymap as unknown as Keymap<object, KeymapEvent>, capture)
    captures.add(capture)
    return capture
  }

  return {
    trackKeymap(keymap) {
      ensureCapture(keymap)
      return keymap
    },
    captureDiagnostics(keymap) {
      return ensureCapture(keymap)
    },
    assertNoUnhandledDiagnostics() {
      try {
        for (const capture of captures) {
          if (capture.externalWarningListeners === 0) {
            expect(capture.warnings).toEqual([])
          }

          if (capture.externalErrorListeners === 0) {
            expect(capture.errors).toEqual([])
          }
        }
      } finally {
        captures.clear()
      }
    },
  }
}
