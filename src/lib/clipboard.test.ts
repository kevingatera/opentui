import { describe, expect, it } from "bun:test"
import { Clipboard, ClipboardTarget } from "./clipboard"

describe("clipboard", () => {
  const createMockAdapter = (options: { supported?: boolean } = {}) => {
    let lastTarget: number | null = null
    let lastPayload: Uint8Array | null = null

    const adapter = {
      copyToClipboard: (target: number, payload: Uint8Array): boolean => {
        lastTarget = target
        lastPayload = payload
        return options.supported ?? true
      },
      isOsc52Supported: (): boolean => {
        return options.supported ?? true
      },
    }

    return {
      adapter,
      getLastTarget: () => lastTarget,
      getLastPayload: () => lastPayload,
    }
  }

  describe("copyToClipboardOSC52", () => {
    it("should return false when OSC 52 is not supported", () => {
      const { adapter } = createMockAdapter({ supported: false })
      const clipboard = new Clipboard(adapter)
      const result = clipboard.copyToClipboardOSC52("test")
      expect(result).toBe(false)
    })

    it("should return true when OSC 52 is supported", () => {
      const { adapter } = createMockAdapter({ supported: true })
      const clipboard = new Clipboard(adapter)
      const result = clipboard.copyToClipboardOSC52("test")
      expect(result).toBe(true)
    })

    it("should encode text as base64 and delegate to adapter", () => {
      const { adapter, getLastTarget, getLastPayload } = createMockAdapter()
      const clipboard = new Clipboard(adapter)
      clipboard.copyToClipboardOSC52("hello")

      expect(getLastTarget()).toBe(ClipboardTarget.Clipboard)
      const payload = getLastPayload()
      expect(payload).not.toBeNull()
      const decoded = new TextDecoder().decode(payload!)
      expect(decoded).toBe(Buffer.from("hello").toString("base64"))
    })

    it("should support different selection targets", () => {
      const { adapter, getLastTarget } = createMockAdapter()
      const clipboard = new Clipboard(adapter)
      clipboard.copyToClipboardOSC52("test", ClipboardTarget.Primary)
      expect(getLastTarget()).toBe(ClipboardTarget.Primary)

      clipboard.copyToClipboardOSC52("test", ClipboardTarget.Secondary)
      expect(getLastTarget()).toBe(ClipboardTarget.Secondary)

      clipboard.copyToClipboardOSC52("test", ClipboardTarget.Query)
      expect(getLastTarget()).toBe(ClipboardTarget.Query)
    })
  })

  describe("clearClipboardOSC52", () => {
    it("should return false when OSC 52 is not supported", () => {
      const { adapter } = createMockAdapter({ supported: false })
      const clipboard = new Clipboard(adapter)
      const result = clipboard.clearClipboardOSC52()
      expect(result).toBe(false)
    })

    it("should send empty payload to adapter", () => {
      const { adapter, getLastPayload } = createMockAdapter()
      const clipboard = new Clipboard(adapter)
      clipboard.clearClipboardOSC52()

      const payload = getLastPayload()
      expect(payload).not.toBeNull()
      expect(payload!.length).toBe(0)
    })
  })

  describe("isOsc52Supported", () => {
    it("should return false when adapter reports not supported", () => {
      const { adapter } = createMockAdapter({ supported: false })
      const clipboard = new Clipboard(adapter)
      expect(clipboard.isOsc52Supported()).toBe(false)
    })

    it("should return true when adapter reports supported", () => {
      const { adapter } = createMockAdapter({ supported: true })
      const clipboard = new Clipboard(adapter)
      expect(clipboard.isOsc52Supported()).toBe(true)
    })
  })
})
