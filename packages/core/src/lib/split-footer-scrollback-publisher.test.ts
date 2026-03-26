import { expect, test } from "bun:test"

import { SplitFooterScrollbackPublisher } from "./split-footer-scrollback-publisher.js"

test("SplitFooterScrollbackPublisher starts empty", () => {
  const publisher = new SplitFooterScrollbackPublisher(40, 6)

  expect(publisher.getState()).toEqual({
    renderOffset: 0,
    outputColumn: 0,
  })

  publisher.destroy()
})

test("SplitFooterScrollbackPublisher tracks partial lines as occupied rows", () => {
  const publisher = new SplitFooterScrollbackPublisher(40, 6)

  expect(publisher.append("abc")).toEqual({
    renderOffset: 1,
    outputColumn: 3,
  })

  publisher.destroy()
})

test("SplitFooterScrollbackPublisher advances rows across newline commits", () => {
  const publisher = new SplitFooterScrollbackPublisher(40, 6)

  expect(publisher.append("a\n")).toEqual({
    renderOffset: 2,
    outputColumn: 0,
  })

  expect(publisher.append("b\n")).toEqual({
    renderOffset: 3,
    outputColumn: 0,
  })

  publisher.destroy()
})

test("SplitFooterScrollbackPublisher tracks exact-wrap tail continuation", () => {
  const publisher = new SplitFooterScrollbackPublisher(4, 6)

  expect(publisher.append("abcd")).toEqual({
    renderOffset: 1,
    outputColumn: 4,
  })

  expect(publisher.append("e")).toEqual({
    renderOffset: 2,
    outputColumn: 1,
  })

  publisher.destroy()
})

test("SplitFooterScrollbackPublisher can seed a pinned viewport", () => {
  const publisher = new SplitFooterScrollbackPublisher(40, 6, 6)

  expect(publisher.append("x")).toEqual({
    renderOffset: 6,
    outputColumn: 1,
  })

  publisher.destroy()
})
