/** JSON value accepted by the portable Failure model. @since 0.3.0 */
export type FailureJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly FailureJsonValue[]
  | { readonly [key: string]: FailureJsonValue };

/** Optional, transport-neutral failure classification. @since 0.3.0 */
export type FailureClassification = {
  readonly category?: string;
  readonly severity?: 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  readonly retryability?: 'UNKNOWN' | 'NEVER' | 'CONDITIONAL' | 'ALWAYS';
};

/**
 * Optional structured error payload for use as `Err<Failure>`.
 *
 * This model never constrains the generic error parameter of `Result<T, E>`.
 * @since 0.3.0
 */
export type Failure = {
  readonly schema_version: '1.0.0';
  readonly code: string;
  readonly message?: string;
  readonly message_key?: string;
  readonly message_args?: Readonly<Record<string, FailureJsonValue>>;
  readonly details?: FailureJsonValue;
  readonly causes?: readonly Failure[];
  readonly classification?: FailureClassification;
  readonly metadata?: Readonly<Record<string, FailureJsonValue>>;
  readonly extensions?: Readonly<Record<string, FailureJsonValue>>;
};

/** Recursive constructor input for a portable Failure. @since 0.3.0 */
export type FailureInput = Omit<Failure, 'causes'> & {
  readonly causes?: readonly FailureInput[];
};

/** Governed resource limits used while validating untrusted Failure input. @since 0.3.0 */
export type FailureLimits = {
  readonly max_depth: number;
  readonly max_causes: number;
  readonly max_nodes: number;
};
