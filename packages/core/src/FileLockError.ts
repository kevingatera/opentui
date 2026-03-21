export type FileLockOp = "create" | "tryAcquire" | "tryAcquireWithTimeout" | "release" | "close"

export enum FileLockErrorCode {
  InvalidHandle = "invalid_handle",
  InvalidPath = "invalid_path",
  AccessDenied = "access_denied",
  FileNotFound = "file_not_found",
  LocksNotSupported = "locks_not_supported",
  SystemResources = "system_resources",
  OutOfMemory = "out_of_memory",
  Unexpected = "unexpected",
  Closing = "closing",
  Closed = "closed",
  InvalidArgument = "invalid_argument",
}

const FILE_LOCK_ERROR_CODE_BY_CAUSE_CODE = {
  invalid_handle: FileLockErrorCode.InvalidHandle,
  invalid_path: FileLockErrorCode.InvalidPath,
  access_denied: FileLockErrorCode.AccessDenied,
  file_not_found: FileLockErrorCode.FileNotFound,
  locks_not_supported: FileLockErrorCode.LocksNotSupported,
  system_resources: FileLockErrorCode.SystemResources,
  out_of_memory: FileLockErrorCode.OutOfMemory,
  unexpected: FileLockErrorCode.Unexpected,
  closing: FileLockErrorCode.Closing,
  EACCES: FileLockErrorCode.AccessDenied,
  EPERM: FileLockErrorCode.AccessDenied,
  ENOENT: FileLockErrorCode.FileNotFound,
  ENOTDIR: FileLockErrorCode.FileNotFound,
  EMFILE: FileLockErrorCode.SystemResources,
  ENFILE: FileLockErrorCode.SystemResources,
  ENOMEM: FileLockErrorCode.OutOfMemory,
  EINVAL: FileLockErrorCode.InvalidPath,
  ENAMETOOLONG: FileLockErrorCode.InvalidPath,
  ERR_INVALID_ARG_TYPE: FileLockErrorCode.InvalidArgument,
  ERR_OUT_OF_RANGE: FileLockErrorCode.InvalidArgument,
} as const

export class FileLockError extends Error {
  public readonly code: FileLockErrorCode
  public readonly path: string
  public readonly op: FileLockOp
  public override readonly cause?: unknown

  public constructor(options: {
    path: string
    op: FileLockOp
    code?: FileLockErrorCode
    cause?: unknown
    message?: string
  }) {
    let code = options.code

    if (
      !code &&
      options.cause &&
      typeof options.cause === "object" &&
      "code" in options.cause &&
      typeof options.cause.code === "string"
    ) {
      code = FILE_LOCK_ERROR_CODE_BY_CAUSE_CODE[options.cause.code as keyof typeof FILE_LOCK_ERROR_CODE_BY_CAUSE_CODE]
    }

    code ??= FileLockErrorCode.Unexpected

    let detail = options.message

    if (!detail) {
      if (options.cause instanceof Error && options.cause.message) {
        detail = options.cause.message
      } else if (typeof options.cause === "string" && options.cause) {
        detail = options.cause
      } else {
        detail = code
      }
    }

    super(options.message ?? `${options.op} failed for ${options.path}: ${detail}`)
    this.name = "FileLockError"
    this.code = code
    this.path = options.path
    this.op = options.op
    this.cause = options.cause
  }
}
