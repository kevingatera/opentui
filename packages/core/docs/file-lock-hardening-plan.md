# FileLock Hardening Plan

## Scope

This plan is based on the review of the `system-locks` branch relative to `main`.

Goals for the remaining follow-up work:

- make the native create path strict and explicit
- preserve original failures when cleanup also fails
- finish the docs around the current public contract
- leave the implementation in a state that is ready for later cross-platform CI verification

Explicit constraints for this work:

- keep `resolveRenderLib()` in `packages/core/src/FileLock.ts` as-is
- leave the global `fileLockRegistry` lifetime in `packages/core/src/zig/lib.zig` as-is for now
- do not add CI work as part of this change; cross-platform CI verification will happen later after implementation is done
- do not push anything to the remote repository during this work

## Current Implementation Snapshot

Relevant files and their current roles:

- `packages/core/src/FileLock.ts`: public TypeScript API, path normalization/preparation, non-blocking retry helper, stable public error codes, lifecycle methods
- `packages/core/src/zig.ts`: FFI symbol declarations and the TypeScript wrapper around the native library, including exhaustive file-lock status mapping
- `packages/core/src/zig/file-lock.zig`: native file lock implementation and registry/handle management
- `packages/core/src/tests/file-lock.test.ts`: subprocess-based behavioural tests plus public/native error-code assertions
- `packages/core/src/tests/file-lock.fixture.ts`: helper process used by the behavioural tests
- `packages/core/src/zig/tests/file-lock_test.zig`: native unit tests

Current behaviour summary:

- `FileLock.open(path, options?)`, `FileLock.tryAcquire(path, options?)`, and `FileLock.tryAcquireWithTimeout(path, options?)` normalize the path, create missing parent directories and lock files by default, and support strict opt-out via `createParentPath: false` and `createIfMissing: false`
- there is no blocking acquire API in TypeScript or Zig; all lock contention handling goes through immediate `tryAcquire()` plus asynchronous retry logic in `FileLock.ts`
- `FileLock.tryAcquireWithTimeout()` retries without blocking the event loop, supports `timeoutMs`, `tickTime`, `waitTick`, and `signal`, defaults `tickTime` to `() => 50`, and returns `null` on timeout
- public `FileLockError`s now expose stable `code`, `path`, `op`, and `cause`
- `packages/core/src/zig.ts` now uses a single exhaustive file-lock status table, including `unexpected`
- the TypeScript behavioural suite covers friendly defaults, strict opt-outs, timeout waiting, aborts, lifecycle semantics, `Symbol.dispose`, repeated contention, and stable error-code assertions
- the native test suite covers invalid handles, destroy semantics, and repeated create/tryAcquire/release/destroy cycles
- the native `open()` path still implicitly creates the file if it does not exist, so the remaining native follow-up should make that path strict existing-file-only

## Remaining Work

### 1. Cleanup error preservation in `packages/core/src/FileLock.ts`

The public error model is mostly in place. The remaining gap is cleanup failure handling:

- when an operation fails and `close()` also fails, preserve the original failure instead of replacing it with the cleanup failure
- keep the stable public `code`, `path`, `op`, and `cause` surface intact
- add targeted tests once that behavior is finalized

### 2. Native create strictness in `packages/core/src/zig/file-lock.zig`

Make native create strict and explicit:

- remove the current implicit `createFileAbsolute()` fallback from `open()`
- after this change, native `open()` should only open an existing absolute file
- the public TypeScript layer remains responsible for the friendly default behaviour

When native create becomes strict, add the matching native coverage:

- native create fails with `file_not_found` when the public layer has not pre-created the file

### 3. Documentation updates

Add or update docs in `packages/core/README.md` and/or `packages/core/docs`.

Document:

- what `FileLock` is for
- the default friendly behaviour (`createIfMissing: true`, `createParentPath: true`)
- the strict opt-out flags
- the non-blocking `tryAcquireWithTimeout()` semantics, including timeout, configurable `tickTime`, abort, and wait-tick behaviour
- the lifecycle contract for `tryAcquire`, `tryAcquireWithTimeout`, `release`, `close`, and `Symbol.dispose`
- that dedicated `.lock` files may remain on disk after release, which is expected
- that lock support depends on the underlying filesystem and platform capabilities

The docs should set expectations clearly for local filesystems and make it obvious that the API is advisory OS locking, not a distributed lock service.

## File-By-File Checklist

`packages/core/src/FileLock.ts`

- preserve original failures when cleanup also fails

`packages/core/src/zig/file-lock.zig`

- make native `open()` strict existing-file-only

`packages/core/src/zig/tests/file-lock_test.zig`

- add strict-create coverage once native `open()` becomes strict

`packages/core/README.md` and/or `packages/core/docs/*`

- document the final public contract

## Recommended Implementation Order

1. Make native create strict in `packages/core/src/zig/file-lock.zig`.
2. Add the strict-create native test.
3. Finish cleanup error preservation in `packages/core/src/FileLock.ts`.
4. Update docs.
5. Run local verification only.

## Local Verification Plan

Because this work changes Zig/native code, local verification should include both build and test passes.

Recommended commands:

- from the repo root: `bun run build`
- from `packages/core`: `bun test src/tests/file-lock.test.ts`
- from `packages/core`: `bun run test:native`

To reduce flake risk before handing off for the later CI run:

- repeat the behavioural contention tests multiple times locally
- repeat the native file-lock tests multiple times locally after the strict-open change lands

This plan intentionally does not include CI workflow changes or CI execution. Final cross-platform verification across Linux, macOS, and Windows will happen later after the implementation is complete.

## Done Criteria

This follow-up is complete when all of the following are true:

- native `open()` is strict existing-file-only
- cleanup failures preserve the original failure instead of hiding it
- the docs describe the real public contract clearly
