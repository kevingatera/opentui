// OSC 52 clipboard support for terminal applications.
// Delegates to native Zig implementation for ANSI sequence generation.

export enum ClipboardTarget {
  Clipboard = 0,
  Primary = 1,
  Secondary = 2,
  Query = 3,
}

export interface ClipboardAdapter {
  copyToClipboard: (target: number, payload: Uint8Array) => boolean
  isOsc52Supported: () => boolean
}

export class Clipboard {
  private adapter: ClipboardAdapter

  constructor(adapter: ClipboardAdapter) {
    this.adapter = adapter
  }

  public copyToClipboardOSC52(text: string, target: ClipboardTarget = ClipboardTarget.Clipboard): boolean {
    if (!this.adapter.isOsc52Supported()) {
      return false
    }
    const base64 = Buffer.from(text).toString("base64")
    const payload = new TextEncoder().encode(base64)
    return this.adapter.copyToClipboard(target, payload)
  }

  public clearClipboardOSC52(target: ClipboardTarget = ClipboardTarget.Clipboard): boolean {
    if (!this.adapter.isOsc52Supported()) {
      return false
    }
    const payload = new TextEncoder().encode("")
    return this.adapter.copyToClipboard(target, payload)
  }

  public isOsc52Supported(): boolean {
    return this.adapter.isOsc52Supported()
  }
}
