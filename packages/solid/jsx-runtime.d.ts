import type {
  AsciiFontProps,
  BoxProps,
  CodeProps,
  ExtendedIntrinsicElements,
  InputProps,
  LinkProps,
  MarkdownProps,
  OpenTUIComponents,
  ScrollBoxProps,
  SelectProps,
  SpanProps,
  TabSelectProps,
  TextareaProps,
  TextProps,
} from "./src/types/elements.js"
import type { DomNode } from "./src/reconciler.js"

type JsxComponent = (props: Record<string, unknown>) => unknown

export declare function jsx(type: string | JsxComponent, props?: Record<string, unknown> | null): JSX.Element
export declare const jsxs: typeof jsx
export declare function jsxDEV(type: string | JsxComponent, props?: Record<string, unknown> | null): JSX.Element
export declare function Fragment(props: { children?: JSX.Element }): JSX.Element

export declare namespace JSX {
  // Replace Node with Renderable
  type Element = DomNode | ArrayElement | string | number | boolean | null | undefined

  type ArrayElement = Array<Element>

  interface IntrinsicElements extends ExtendedIntrinsicElements<OpenTUIComponents> {
    box: BoxProps
    text: TextProps
    span: SpanProps
    input: InputProps
    select: SelectProps
    ascii_font: AsciiFontProps
    tab_select: TabSelectProps
    scrollbox: ScrollBoxProps
    code: CodeProps
    textarea: TextareaProps
    markdown: MarkdownProps

    b: SpanProps
    strong: SpanProps
    i: SpanProps
    em: SpanProps
    u: SpanProps
    br: {}
    a: LinkProps
  }

  interface ElementChildrenAttribute {
    children: {}
  }
}
