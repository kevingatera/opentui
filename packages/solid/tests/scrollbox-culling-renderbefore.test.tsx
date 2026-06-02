import { afterEach, describe, expect, it } from "bun:test"
import { For, createSignal } from "solid-js"
import { testRender } from "../index.js"
import type { BoxRenderable, ScrollBoxRenderable } from "../../core/src/renderables/index.js"

let testSetups: Array<Awaited<ReturnType<typeof testRender>>> = []

describe("ScrollBox culling with render-time layout changes", () => {
  afterEach(() => {
    for (const setup of testSetups) {
      setup.renderer.destroy()
    }
    testSetups = []
  })

  it("renders the same visible text as unculled content after scrolling a long session", async () => {
    const rows = Array.from({ length: 240 }, (_, i) => i)
    const targetScrollTop = 1190

    function InlineToolLike(props: { row: number }) {
      const [margin, setMargin] = createSignal(0)

      return (
        <box
          id={`tool-${props.row}`}
          paddingLeft={3}
          marginTop={margin()}
          renderBefore={function () {
            const element = this as BoxRenderable
            const parent = element.parent
            if (!parent) return

            if (element.height > 1) {
              setMargin(1)
              return
            }

            const siblings = parent.getChildren()
            const previous = siblings[siblings.indexOf(element) - 1]
            if (!previous) {
              setMargin(0)
              return
            }

            setMargin(previous.height > 1 || previous.id.startsWith("text-") ? 1 : 0)
          }}
        >
          <text paddingLeft={3}>TOOL_{props.row}</text>
        </box>
      )
    }

    const renderSession = async (viewportCulling: boolean) => {
      let scroll: ScrollBoxRenderable | undefined

      const setup = await testRender(
        () => (
          <box flexDirection="row" flexGrow={1} minHeight={0}>
            <box flexGrow={1} minHeight={0} paddingBottom={1} paddingLeft={2} paddingRight={2} gap={1}>
              <scrollbox
                ref={(element) => (scroll = element)}
                viewportOptions={{ paddingRight: 1 }}
                verticalScrollbarOptions={{ paddingLeft: 1, visible: true }}
                stickyScroll={true}
                stickyStart="bottom"
                flexGrow={1}
                viewportCulling={viewportCulling}
              >
                <box height={1} />
                <For each={rows}>
                  {(row) => (
                    <>
                      <box id={`message-${row}`} border={["left"]} marginTop={row === 0 ? 0 : 1}>
                        <box paddingTop={1} paddingBottom={1} paddingLeft={2} flexShrink={0}>
                          <text>MESSAGE_{row}</text>
                        </box>
                      </box>
                      <InlineToolLike row={row} />
                      <box
                        id={`text-${row}`}
                        border={["left"]}
                        paddingTop={1}
                        paddingBottom={1}
                        paddingLeft={2}
                        marginTop={1}
                      >
                        <text>{`VALUE_${row}\nDONE_${row}`}</text>
                      </box>
                    </>
                  )}
                </For>
              </scrollbox>
              <box flexShrink={0}>
                <text>Prompt</text>
              </box>
            </box>
          </box>
        ),
        { width: 100, height: 23 },
      )

      testSetups.push(setup)
      await setup.renderOnce()
      await setup.renderOnce()

      if (!scroll) {
        throw new Error("ScrollBox ref was not assigned")
      }

      return { setup, scroll }
    }

    const culled = await renderSession(true)
    const unculled = await renderSession(false)

    culled.scroll.scrollTo(targetScrollTop)
    unculled.scroll.scrollTo(targetScrollTop)

    await culled.setup.renderOnce()
    await unculled.setup.renderOnce()

    const tokenPattern = /(?:MESSAGE_\d+|TOOL_\d+|VALUE_\d+|DONE_\d+)/g
    const actualFrame = culled.setup.captureCharFrame()
    const expectedFrame = unculled.setup.captureCharFrame()
    const actualTokens = new Set(actualFrame.match(tokenPattern) ?? [])
    const expectedTokens = new Set(expectedFrame.match(tokenPattern) ?? [])
    const missingTokens = [...expectedTokens].filter((token) => !actualTokens.has(token))

    if (missingTokens.length > 0) {
      console.log({ targetScrollTop, missingTokens })
      console.log("culled frame:\n" + actualFrame)
      console.log("unculled frame:\n" + expectedFrame)
    }

    expect(missingTokens).toEqual([])
  })
})
