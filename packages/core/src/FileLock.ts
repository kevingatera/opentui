import { closeSync, existsSync, mkdirSync, openSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"

import { FileLockError, type FileLockOp } from "./FileLockError"
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
      const wrapped =
        error instanceof FileLockError ? error : new FileLockError({ path: lock.path, op: "tryAcquire", cause: error })

      try {
        lock.close()
      } catch (closeError) {
        const cleanupMessage =
          closeError instanceof Error && closeError.message
            ? closeError.message
            : typeof closeError === "string" && closeError
              ? closeError
              : "unknown error"

        throw new FileLockError({
          code: wrapped.code,
          path: lock.path,
          op: "tryAcquire",
          cause: closeError,
          message: `${wrapped.message}; cleanup failed: ${cleanupMessage}`,
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
        if (closeError instanceof FileLockError) {
          throw closeError
        }

        throw new FileLockError({ path: lock.path, op: "close", cause: closeError })
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
        throw new FileLockError({
          path: this.path,
          op: "create",
          code: "invalid_path",
          message: `create failed for ${this.path}: FileLock path must be a string`,
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

      this.path = resolve(path)

      if (options.createParentPath !== false) {
        mkdirSync(dirname(this.path), { recursive: true })
      }

      if (options.createIfMissing === false) {
        if (!existsSync(this.path)) {
          throw new FileLockError({
            path: this.path,
            op: "create",
            code: "file_not_found",
            message: `create failed for ${this.path}: Lock file does not exist: ${this.path}`,
          })
        }
      } else {
        closeSync(openSync(this.path, "a"))
      }

      this.id = this.lib.createFileLock(this.path)
    } catch (error) {
      if (error instanceof FileLockError) {
        throw error
      }

      if (error && typeof error === "object" && "code" in error) {
        if (error.code === "ENOENT" || error.code === "ENOTDIR") {
          throw new FileLockError({ path: this.path, op: "create", code: "file_not_found", cause: error })
        }

        if (error.code === "EACCES" || error.code === "EPERM") {
          throw new FileLockError({ path: this.path, op: "create", code: "access_denied", cause: error })
        }
      }

      throw new FileLockError({ path: this.path, op: "create", cause: error })
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
      if (error instanceof FileLockError) {
        throw error
      }

      throw new FileLockError({ path: this.path, op: "tryAcquire", cause: error })
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
      throw new FileLockError({
        path: this.path,
        op: "tryAcquireWithTimeout",
        code: "invalid_argument",
        message: `tryAcquireWithTimeout failed for ${this.path}: FileLock timeoutMs must be a finite, non-negative number`,
      })
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
      if (error instanceof FileLockError) {
        throw error
      }

      throw new FileLockError({ path: this.path, op: "release", cause: error })
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
      if (error instanceof FileLockError) {
        throw error
      }

      throw new FileLockError({ path: this.path, op: "close", cause: error })
    }
  }

  public [Symbol.dispose](): void {
    this.close()
  }

  private assertOpen(op: FileLockOp): void {
    if (!this.closed) {
      return
    }

    throw new FileLockError({
      code: "closed",
      path: this.path,
      op,
      message: `FileLock is closed: ${this.path}`,
    })
  }
}
