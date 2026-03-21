import { writeFileSync } from "node:fs"
import { setTimeout as sleep } from "node:timers/promises"

import { FileLock } from "../FileLock"

const args = process.argv.slice(2)
const [mode, lockPath] = args

if (!mode || !lockPath) {
  throw new Error("Expected mode and lock path")
}

function mustTryAcquire(path: string): FileLock {
  const lock = FileLock.tryAcquire(path)

  if (!lock) {
    throw new Error(`Failed to acquire lock: ${path}`)
  }

  return lock
}

switch (mode) {
  case "hold": {
    const readyPath = args[2]
    const ms = Number(args[3] ?? "0")
    const lock = mustTryAcquire(lockPath)

    try {
      if (readyPath) writeFileSync(readyPath, "ready")
      await sleep(ms)
    } finally {
      lock.close()
    }
    break
  }
  case "hang": {
    const readyPath = args[2]
    const lock = mustTryAcquire(lockPath)

    try {
      if (readyPath) writeFileSync(readyPath, "ready")
      await sleep(60_000)
    } finally {
      lock.close()
    }
    break
  }
  case "try": {
    const lock = FileLock.tryAcquire(lockPath)

    try {
      console.log(JSON.stringify({ acquired: !!lock }))
    } finally {
      lock?.close()
    }
    break
  }
  case "contend": {
    const worker = args[2] ?? String(process.pid)
    const holdMs = Number(args[3] ?? "0")
    const timeoutMs = Number(args[4] ?? "2000")
    const tickMs = Number(args[5] ?? "10")
    const lock = await FileLock.tryAcquireWithTimeout(lockPath, {
      timeoutMs,
      tickTime: () => tickMs,
    })

    if (!lock) {
      throw new Error(`Timed out acquiring lock: ${lockPath}`)
    }

    const acquiredAt = Date.now()

    try {
      await sleep(holdMs)
    } finally {
      lock.close()
    }

    console.log(JSON.stringify({ worker, acquiredAt, releasedAt: Date.now() }))
    break
  }
  default:
    throw new Error(`Unknown mode: ${mode}`)
}
