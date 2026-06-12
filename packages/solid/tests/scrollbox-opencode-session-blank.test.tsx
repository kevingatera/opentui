import { afterEach, describe, expect, it } from "bun:test"
import type { BoxRenderable } from "@opentui/core"
import { Show, createSignal } from "solid-js"
import { testRender } from "../index.js"

let setup: Awaited<ReturnType<typeof testRender>> | undefined

afterEach(() => {
  setup?.renderer.destroy()
  setup = undefined
})

describe("OpenCode session blank content", () => {
  it("renders a complete tool block updated immediately after a frame", async () => {
    const [completed, setCompleted] = createSignal(false)
    let reserved: BoxRenderable | undefined

    setup = await testRender(
      () => (
        <box flexDirection="column" width={72} height={20}>
          <scrollbox stickyScroll={true} stickyStart="bottom" flexGrow={1}>
            <box height={30} flexShrink={0}>
              <text>HISTORY</text>
            </box>
            <box ref={(value: BoxRenderable) => (reserved = value)} height={12} flexShrink={0}>
              <Show when={completed()}>
                <box
                  id="tool-block-result"
                  height={12}
                  border={["left"]}
                  paddingTop={1}
                  paddingBottom={1}
                  paddingLeft={2}
                  backgroundColor="#202020"
                >
                  <text># Bash result</text>
                  <text>FULL_TOOL_RESULT_0</text>
                  <text>FULL_TOOL_RESULT_1</text>
                  <text>FULL_TOOL_RESULT_2</text>
                </box>
              </Show>
            </box>
          </scrollbox>
        </box>
      ),
      { width: 72, height: 20 },
    )

    await setup.renderer.idle()

    const renderer = setup.renderer as any
    const originalLoop = renderer.loop.bind(renderer)
    let updateAfterFrame = true
    let stateUpdated = false
    renderer.loop = async () => {
      await originalLoop()
      if (updateAfterFrame) {
        updateAfterFrame = false
        setCompleted(true)
        stateUpdated = true
      }
    }

    setup.renderer.requestRender()
    await setup.renderer.idle()
    await Promise.resolve()

    const blankFrame = setup.captureCharFrame()
    expect(stateUpdated).toBe(true)
    expect(completed()).toBe(true)
    expect(reserved?.height).toBe(12)
    expect(reserved?.findDescendantById("tool-block-result")).toBeDefined()

    setup.renderer.resize(73, 20)
    await setup.renderer.idle()

    expect(setup.captureCharFrame()).toContain("FULL_TOOL_RESULT_2")
    expect(blankFrame).toContain("FULL_TOOL_RESULT_2")
  })
})
