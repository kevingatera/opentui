import { closeSync, existsSync, mkdirSync, openSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { resolveRenderLib, type FileLockNativeErrorCode } from "./zig"

type FileLockOp = "create" | "tryAcquire" | "tryAcquireWithTimeout" | "release" | "close"

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

export type FileLockErrorCode = FileLockNativeErrorCode | "closed" | "invalid_argument"

export class FileLockError extends Error {
  public readonly code: FileLockErrorCode
  public readonly path: string
  public readonly op: FileLockOp
  public override readonly cause?: unknown

  public constructor(
    message: string,
    options: { path: string; op: FileLockOp; code: FileLockErrorCode; cause?: unknown },
  ) {
    super(message)
    this.name = "FileLockError"
    this.code = options.code
    this.path = options.path
    this.op = options.op
    this.cause = options.cause
  }
}

function wrapError(path: string, op: FileLockOp, error: unknown): FileLockError {
  if (error instanceof FileLockError) return error

  let message = "unknown error"
  let code: FileLockErrorCode = "unexpected"

  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    switch (error.code) {
      case "invalid_handle":
      case "invalid_path":
      case "access_denied":
      case "file_not_found":
      case "locks_not_supported":
      case "system_resources":
      case "out_of_memory":
      case "unexpected":
      case "closing":
        code = error.code
        break
      case "EACCES":
      case "EPERM":
        code = "access_denied"
        break
      case "ENOENT":
      case "ENOTDIR":
        code = "file_not_found"
        break
      case "EMFILE":
      case "ENFILE":
        code = "system_resources"
        break
      case "ENOMEM":
        code = "out_of_memory"
        break
      case "EINVAL":
      case "ENAMETOOLONG":
        code = "invalid_path"
        break
      case "ERR_INVALID_ARG_TYPE":
      case "ERR_OUT_OF_RANGE":
        code = "invalid_argument"
        break
    }
  }

  if (error instanceof Error && error.message) {
    message = error.message
  } else if (typeof error === "string" && error) {
    message = error
  }

  if (code === "unexpected") {
    if (message === "FileLock path must be a string" || message === "FileLock path must not be empty") {
      code = "invalid_path"
    } else if (
      message === "FileLock timeoutMs must be a finite, non-negative number" ||
      message === "FileLock tickTime must return a finite, non-negative number"
    ) {
      code = "invalid_argument"
    } else if (message.startsWith("Lock file does not exist: ")) {
      code = "file_not_found"
    }
  }

  return new FileLockError(`${op} failed for ${path}: ${message}`, {
    code,
    path,
    op,
    cause: error,
  })
}

export class FileLock {
  public static open(path: string, options?: FileLockOpenOptions): FileLock {
    return new FileLock(path, options)
  }

  public static tryAcquire(path: string, options?: FileLockOpenOptions): FileLock | null {
    const lock = FileLock.open(path, options)

    try {
      if (!lock.tryAcquire()) {
        lock.close()
        return null
      }

      return lock
    } catch (error) {
      const wrapped = wrapError(lock.path, "tryAcquire", error)

      try {
        lock.close()
      } catch (closeError) {
        const cleanupMessage =
          closeError instanceof Error && closeError.message
            ? closeError.message
            : typeof closeError === "string" && closeError
              ? closeError
              : "unknown error"

        throw new FileLockError(`${wrapped.message}; cleanup failed: ${cleanupMessage}`, {
          code: wrapped.code,
          path: lock.path,
          op: "tryAcquire",
          cause: closeError,
        })
      }

      throw wrapped
    }
  }

  public static async tryAcquireWithTimeout(
    path: string,
    options: FileLockTryAcquireWithTimeoutOptions = {},
  ): Promise<FileLock | null> {
    const lock = FileLock.open(path, options)

    try {
      if (!(await lock.tryAcquireWithTimeout(options))) {
        lock.close()
        return null
      }

      return lock
    } catch (error) {
      try {
        lock.close()
      } catch (closeError) {
        throw wrapError(lock.path, "close", closeError)
      }

      throw error
    }
  }

  public readonly path: string
  private readonly lib = resolveRenderLib()
  private id: number
  private held = false
  private closed = false

  private constructor(path: string, options: FileLockOpenOptions = {}) {
    this.path = typeof path === "string" ? path : String(path)

    try {
      if (typeof path !== "string") {
        throw new TypeError("FileLock path must be a string")
      }

      if (!path.trim()) {
        throw new Error("FileLock path must not be empty")
      }

      this.path = resolve(path)

      if (options.createParentPath !== false) {
        mkdirSync(dirname(this.path), { recursive: true })
      }

      if (options.createIfMissing === false) {
        if (!existsSync(this.path)) {
          throw new Error(`Lock file does not exist: ${this.path}`)
        }
      } else {
        closeSync(openSync(this.path, "a"))
      }

      this.id = this.lib.createFileLock(this.path)
    } catch (error) {
      throw wrapError(this.path, "create", error)
    }
  }

  public get acquired(): boolean {
    return this.held
  }

  public tryAcquire(): boolean {
    this.assertOpen("tryAcquire")

    if (this.held) {
      return true
    }

    try {
      this.held = this.lib.fileLockTryAcquire(this.id)
      return this.held
    } catch (error) {
      throw wrapError(this.path, "tryAcquire", error)
    }
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
      throw wrapError(
        this.path,
        "tryAcquireWithTimeout",
        new TypeError("FileLock timeoutMs must be a finite, non-negative number"),
      )
    }

    const tickTime = options.tickTime ?? (() => 50)
    const start = Date.now()
    let attempt = 0
    let waited = 0

    while (true) {
      if (options.signal?.aborted) {
        throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
      }

      if (this.tryAcquire()) {
        return true
      }

      const elapsed = Date.now() - start

      if (options.timeoutMs !== undefined && elapsed >= options.timeoutMs) {
        return false
      }

      attempt += 1

      const nextDelay = tickTime(attempt)

      if (typeof nextDelay !== "number" || !Number.isFinite(nextDelay) || nextDelay < 0) {
        throw wrapError(
          this.path,
          "tryAcquireWithTimeout",
          new TypeError("FileLock tickTime must return a finite, non-negative number"),
        )
      }

      const delay =
        options.timeoutMs === undefined ? nextDelay : Math.min(nextDelay, Math.max(options.timeoutMs - elapsed, 0))

      waited += delay
      await options.waitTick?.({ file: this.path, attempt, delay, waited })

      try {
        await sleep(delay, undefined, options.signal ? { signal: options.signal } : undefined)
      } catch (error) {
        if (options.signal?.aborted) {
          throw options.signal.reason ?? error
        }

        throw error
      }
    }
  }

  public release(): void {
    if (this.closed || !this.held) {
      return
    }

    try {
      this.lib.fileLockRelease(this.id)
      this.held = false
    } catch (error) {
      throw wrapError(this.path, "release", error)
    }
  }

  public close(): void {
    if (this.closed) {
      return
    }

    try {
      this.lib.destroyFileLock(this.id)
      this.held = false
      this.closed = true
      this.id = 0
    } catch (error) {
      throw wrapError(this.path, "close", error)
    }
  }

  public [Symbol.dispose](): void {
    this.close()
  }

  private assertOpen(op: FileLockOp): void {
    if (!this.closed) {
      return
    }

    throw new FileLockError(`FileLock is closed: ${this.path}`, {
      code: "closed",
      path: this.path,
      op,
    })
  }
}
