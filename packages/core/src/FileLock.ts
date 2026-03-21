import { resolve } from "node:path"
import type { Pointer } from "bun:ffi"

import { FileLockError, type FileLockOp } from "./FileLockError"
import { type Clock, SystemClock } from "./lib/clock"
import { resolveRenderLib } from "./zig"

export { FileLockError } from "./FileLockError"

export interface FileLockOpenOptions {
  createIfMissing?: boolean
  createParentPath?: boolean
}

export interface FileLockWaitTick {
  file: string
  attempt: number
  delay: number
  waited: number
}

export interface FileLockTryAcquireWithTimeoutOptions {
  createIfMissing?: boolean
  createParentPath?: boolean
  timeoutMs?: number
  tickTime?: (attempt: number) => number
  waitTick?: (input: FileLockWaitTick) => void | Promise<void>
  signal?: AbortSignal
}

type FileLockTryAcquireWithTimeoutInternalOptions = FileLockTryAcquireWithTimeoutOptions & { clock?: Clock }

const SYSTEM_CLOCK = new SystemClock()

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Aborted", "AbortError")
}

function waitForDelay(clock: Clock, delay: number, signal?: AbortSignal): Promise<void> {
  if (delay <= 0) {
    return Promise.resolve()
  }

  if (!signal) {
    return new Promise<void>((resolve) => {
      clock.setTimeout(resolve, delay)
    })
  }

  if (signal.aborted) {
    return Promise.reject(abortReason(signal))
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clock.clearTimeout(timer)
      reject(abortReason(signal))
    }

    const timer = clock.setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, delay)

    signal.addEventListener("abort", onAbort, { once: true })
  })
}

function normalizePath(path: string): string {
  if (typeof path !== "string") {
    throw new FileLockError({
      path: String(path),
      op: "create",
      code: "invalid_path",
      message: `create failed for ${String(path)}: FileLock path must be a string`,
    })
  }

  if (!path.trim()) {
    throw new FileLockError({
      path,
      op: "create",
      code: "invalid_path",
      message: `create failed for ${path}: FileLock path must not be empty`,
    })
  }

  return resolve(path)
}

export class FileLock {
  public static open(path: string, options: FileLockOpenOptions = {}): FileLock {
    const normalizedPath = normalizePath(path)
    const ptr = resolveRenderLib().createFileLock(
      normalizedPath,
      options.createIfMissing ?? true,
      options.createParentPath ?? true,
    )

    return new FileLock(normalizedPath, ptr)
  }

  public static tryAcquire(path: string, options: FileLockOpenOptions = {}): FileLock | null {
    const normalizedPath = normalizePath(path)
    const ptr = resolveRenderLib().createFileLockAndTryAcquire(
      normalizedPath,
      options.createIfMissing ?? true,
      options.createParentPath ?? true,
    )

    return ptr === null ? null : new FileLock(normalizedPath, ptr, true)
  }

  public static async tryAcquireWithTimeout(
    path: string,
    options: FileLockTryAcquireWithTimeoutOptions = {},
  ): Promise<FileLock | null> {
    const lock = FileLock.open(path, options)

    try {
      if (!(await lock.tryAcquireWithTimeout(options as FileLockTryAcquireWithTimeoutInternalOptions))) {
        lock.close()
        return null
      }

      return lock
    } catch (error) {
      try {
        lock.close()
      } catch {}

      throw error
    }
  }

  public readonly path: string
  private readonly lib = resolveRenderLib()
  private ptr: Pointer
  private held = false
  private closed = false

  private constructor(path: string, ptr: Pointer, held = false) {
    this.path = path
    this.ptr = ptr
    this.held = held
  }

  public get acquired(): boolean {
    return this.held
  }

  public tryAcquire(): boolean {
    this.assertOpen("tryAcquire")

    if (this.held) {
      return true
    }

    this.held = this.lib.fileLockTryAcquire(this.ptr)
    return this.held
  }

  public async tryAcquireWithTimeout(
    options: {
      timeoutMs?: number
      tickTime?: (attempt: number) => number
      waitTick?: (input: FileLockWaitTick) => void | Promise<void>
      signal?: AbortSignal
    } = {},
  ): Promise<boolean> {
    this.assertOpen("tryAcquireWithTimeout")

    if (this.held) {
      return true
    }

    if (
      options.timeoutMs !== undefined &&
      (typeof options.timeoutMs !== "number" || !Number.isFinite(options.timeoutMs) || options.timeoutMs < 0)
    ) {
      throw new FileLockError({
        path: this.path,
        op: "tryAcquireWithTimeout",
        code: "invalid_argument",
        message: `tryAcquireWithTimeout failed for ${this.path}: FileLock timeoutMs must be a finite, non-negative number`,
      })
    }

    const tickTime = options.tickTime ?? (() => 50)
    const clock = (options as FileLockTryAcquireWithTimeoutInternalOptions).clock ?? SYSTEM_CLOCK
    const startedAt = clock.now()
    let attempt = 0
    let waited = 0

    while (true) {
      if (options.signal?.aborted) {
        throw abortReason(options.signal)
      }

      if (this.tryAcquire()) {
        return true
      }

      const elapsed = clock.now() - startedAt

      if (options.timeoutMs !== undefined && elapsed >= options.timeoutMs) {
        return false
      }

      attempt += 1

      const nextDelay = tickTime(attempt)

      if (typeof nextDelay !== "number" || !Number.isFinite(nextDelay) || nextDelay < 0) {
        throw new FileLockError({
          path: this.path,
          op: "tryAcquireWithTimeout",
          code: "invalid_argument",
          message: `tryAcquireWithTimeout failed for ${this.path}: FileLock tickTime must return a finite, non-negative number`,
        })
      }

      const delay =
        options.timeoutMs === undefined ? nextDelay : Math.min(nextDelay, Math.max(options.timeoutMs - elapsed, 0))

      waited += delay
      await options.waitTick?.({ file: this.path, attempt, delay, waited })
      await waitForDelay(clock, delay, options.signal)
    }
  }

  public release(): void {
    if (this.closed || !this.held) {
      return
    }

    this.lib.fileLockRelease(this.ptr)
    this.held = false
  }

  public close(): void {
    if (this.closed) {
      return
    }

    this.lib.destroyFileLock(this.ptr)
    this.held = false
    this.closed = true
  }

  public [Symbol.dispose](): void {
    this.close()
  }

  private assertOpen(op: FileLockOp): void {
    if (!this.closed) {
      return
    }

    throw new FileLockError({
      path: this.path,
      op,
      code: "closed",
      message: `FileLock is closed: ${this.path}`,
    })
  }
}
