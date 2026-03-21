# FileLock Hardening Plan

## Scope

This plan is based on the review of the `system-locks` branch relative to `main`.

Goals for the remaining follow-up work:

- make error handling exhaustive and programmatic
- make the native create path strict and explicit
- finish the docs around the current public contract
- leave the implementation in a state that is ready for later cross-platform CI verification

Explicit constraints for this work:

- keep `resolveRenderLib()` in `packages/core/src/FileLock.ts` as-is
- leave the global `fileLockRegistry` lifetime in `packages/core/src/zig/lib.zig` as-is for now
- do not add CI work as part of this change; cross-platform CI verification will happen later after implementation is done
- do not push anything to the remote repository during this work

## Current Implementation Snapshot

Relevant files and their current roles:

- `packages/core/src/FileLock.ts`: public TypeScript API, path normalization/preparation, non-blocking retry helper, error wrapping, lifecycle methods
- `packages/core/src/zig.ts`: FFI symbol declarations and the TypeScript wrapper around the native library
- `packages/core/src/zig-structs.ts`: FFI struct packing/unpacking helpers
- `packages/core/src/zig/file-lock.zig`: native file lock implementation and registry/handle management
- `packages/core/src/zig/lib.zig`: exported native functions and the process-global registry instance
- `packages/core/src/tests/file-lock.test.ts`: subprocess-based TypeScript behavioural tests
- `packages/core/src/tests/file-lock.fixture.ts`: helper process used by the behavioural tests
- `packages/core/src/zig/tests/file-lock_test.zig`: native unit tests

Current behaviour summary:

- `FileLock.open(path, options?)`, `FileLock.tryAcquire(path, options?)`, and `FileLock.tryAcquireWithTimeout(path, options?)` normalize the path, create missing parent directories and lock files by default, and support strict opt-out via `createParentPath: false` and `createIfMissing: false`
- there is no blocking acquire API in TypeScript or Zig; all lock contention handling goes through immediate `tryAcquire()` plus asynchronous retry logic in `FileLock.ts`
- `FileLock.tryAcquireWithTimeout()` retries without blocking the event loop, supports `timeoutMs`, `tickTime`, `waitTick`, and `signal`, defaults `tickTime` to `() => 50`, and returns `null` on timeout
- the TypeScript behavioural suite now covers friendly defaults, strict opt-outs, timeout waiting, aborts, lifecycle semantics, `Symbol.dispose`, and repeated multi-process contention
- the native test suite now covers invalid handles, destroy semantics, and repeated create/tryAcquire/release/destroy cycles
- the native `open()` path still implicitly creates the file if it does not exist, so the remaining native follow-up should make that path strict existing-file-only
- TypeScript status decoding in `packages/core/src/zig.ts` is still not exhaustive from a single source of truth; status `9` (`unexpected`) is still handled ad hoc

## Remaining Work

### 1. Public error model in `packages/core/src/FileLock.ts`

The remaining work in the public TypeScript layer is about the error surface, not lock-waiting semantics:

- extend `FileLockError` with a stable `code` field
- keep `path`, `op`, and `cause`
- map pre-create filesystem failures to the same public code namespace used for native errors where possible, for example:
  - `invalid_path`
  - `access_denied`
  - `file_not_found`
  - `system_resources`
  - `unexpected`
- use a small TS-only code such as `closed` only when the failure comes from API misuse before any native call happens
- update cleanup so a `close()` failure augments the original failure instead of replacing it

Once that lands, add/adjust tests so the stable `code` field is asserted directly instead of relying on message text.

### 2. Native create strictness in `packages/core/src/zig/file-lock.zig`

Make native create strict and explicit:

- remove the current implicit `createFileAbsolute()` fallback from `open()`
- after this change, native `open()` should only open an existing absolute file
- the public TypeScript layer remains responsible for the friendly default behaviour

### 3. FFI status cleanup in `packages/core/src/zig.ts`

Keep the native create ABI small:

- keep `createFileLock(pathPtr, pathLen, outPtr)` as-is
- no create-options struct is needed while path preparation stays in `FileLock.ts`

Make status handling exhaustive in `packages/core/src/zig.ts`:

- replace the current ad-hoc `switch` in `fileLockStatus()` with a single status table or exhaustive constant map
- explicitly include every current status, including the currently missing `unexpected`
- keep a single source of truth for these status names to avoid future drift
- surface stable public error codes instead of relying on message parsing alone

### 4. Native tests that should land with the strict-open change

When native create becomes strict, add the matching native coverage:

- strict create behaviour: native create fails with `file_not_found` when the public layer has not pre-created the file

### 5. Documentation updates

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

- add stable `FileLockError.code`
- improve cleanup error preservation

`packages/core/src/zig/file-lock.zig`

- make native `open()` strict existing-file-only

`packages/core/src/zig.ts`

- centralize and exhaustively handle file-lock statuses
- surface stable error codes

`packages/core/src/zig-structs.ts`

- no change expected unless implementation later chooses richer result structs

`packages/core/src/zig/tests/file-lock_test.zig`

- add strict-create coverage once native `open()` becomes strict

`packages/core/README.md` and/or `packages/core/docs/*`

- document the final public contract

## Recommended Implementation Order

1. Make native create strict in `packages/core/src/zig/file-lock.zig`.
2. Clean up exhaustive status/error handling in `packages/core/src/zig.ts`.
3. Finish the public error model in `packages/core/src/FileLock.ts`.
4. Add the strict-create native test.
5. Update docs.
6. Run local verification only.

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
- status handling is exhaustive, including `unexpected`
- public errors expose stable machine-readable codes
- cleanup failures preserve the original failure instead of hiding it
- the docs describe the real public contract clearly
