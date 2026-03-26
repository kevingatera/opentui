import { TextBuffer } from "../text-buffer.js"
import { TextBufferView } from "../text-buffer-view.js"

export interface SplitFooterScrollbackState {
  renderOffset: number
  outputColumn: number
}

// Internal Stage 3-aligned primitive:
// - append raw output bytes as scrollback data,
// - measure the logical scrollback rows with the shared text layout engine,
// - expose footer placement + tail column as commit metadata.
export class SplitFooterScrollbackPublisher {
  private textBuffer: TextBuffer
  private textBufferView: TextBufferView
  private width: number = 1
  private pinnedRenderOffset: number = 0
  private baseRows: number = 0
  private state: SplitFooterScrollbackState = {
    renderOffset: 0,
    outputColumn: 0,
  }

  constructor(width: number, pinnedRenderOffset: number, baseRows: number = 0) {
    this.textBuffer = TextBuffer.create("unicode")
    this.textBufferView = TextBufferView.create(this.textBuffer)
    this.textBufferView.setWrapMode("char")
    this.configure(width, pinnedRenderOffset)
    this.reset(baseRows)
  }

  public configure(width: number, pinnedRenderOffset: number): void {
    this.width = Math.max(width, 1)
    this.pinnedRenderOffset = Math.max(pinnedRenderOffset, 0)
    this.textBufferView.setWrapWidth(this.width)
    this.recomputeState()
  }

  public reset(baseRows: number = 0): void {
    this.baseRows = Math.max(baseRows, 0)
    this.textBuffer.reset()
    this.recomputeState()
  }

  public append(output: string): SplitFooterScrollbackState {
    if (output.length > 0) {
      this.textBuffer.append(output)
    }

    this.recomputeState()
    return this.getState()
  }

  public getState(): SplitFooterScrollbackState {
    return {
      renderOffset: this.state.renderOffset,
      outputColumn: this.state.outputColumn,
    }
  }

  public destroy(): void {
    this.textBufferView.destroy()
    this.textBuffer.destroy()
  }

  private recomputeState(): void {
    const virtualLineCount = this.textBuffer.byteSize === 0 ? 0 : this.textBufferView.getVirtualLineCount()
    const totalRows = this.baseRows + virtualLineCount
    const renderOffset = this.pinnedRenderOffset > 0 ? Math.min(totalRows, this.pinnedRenderOffset) : 0

    let outputColumn = 0
    if (virtualLineCount > 0) {
      const lineInfo = this.textBufferView.lineInfo
      outputColumn = Math.min(lineInfo.lineWidthCols.at(-1) ?? 0, this.width)
    }

    this.state = {
      renderOffset,
      outputColumn,
    }
  }
}
