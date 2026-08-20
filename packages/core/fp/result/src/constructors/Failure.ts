import { hasOnlyOwnDataFields } from '../internal/object.js';
import type {
  Failure as FailureValue,
  FailureInput,
  FailureJsonValue,
  FailureLimits,
} from '../types/core/Failure.js';

/** Public structured Failure value type paired with the Failure constructor. @since 0.3.0 */
export interface Failure extends FailureValue {}

/** Default bounded-validation profile for portable Failure data. @since 0.3.0 */
export const DEFAULT_FAILURE_LIMITS: FailureLimits = Object.freeze({
  max_depth: 32,
  max_causes: 64,
  max_nodes: 1024,
});

const absoluteUri = /^[A-Za-z][A-Za-z0-9+.-]*:[^\s]+$/;
const severities = new Set(['DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL']);
const retryabilities = new Set(['UNKNOWN', 'NEVER', 'CONDITIONAL', 'ALWAYS']);
const failureFields = [
  'schema_version',
  'code',
  'message',
  'message_key',
  'message_args',
  'details',
  'causes',
  'classification',
  'metadata',
  'extensions',
] as const;

const getArrayItems = (value: readonly unknown[]): readonly unknown[] => {
  const lengthDescriptor = Reflect.getOwnPropertyDescriptor(value, 'length');
  const rawLength: unknown = lengthDescriptor?.value;
  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    typeof rawLength !== 'number' ||
    !Number.isSafeInteger(rawLength) ||
    rawLength < 0
  ) {
    throw new TypeError('Failure arrays must have a valid data length');
  }
  const length = rawLength;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== length + 1 ||
    !keys.includes('length') ||
    keys.some(
      (key) =>
        typeof key !== 'string' ||
        (key !== 'length' &&
          (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= length)),
    )
  ) {
    throw new TypeError(
      'Failure arrays must be dense and contain no extra fields',
    );
  }
  return Array.from({ length }, (_, index) => {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor)
    ) {
      throw new TypeError('Failure array items must be own data fields');
    }
    return descriptor.value as unknown;
  });
};

const cloneJson = (
  value: FailureJsonValue,
  depth: number,
  limits: FailureLimits,
  ancestors: Set<object>,
  state: { nodes: number },
): FailureJsonValue => {
  if (depth > limits.max_depth)
    throw new RangeError(`Failure data exceeds max_depth ${limits.max_depth}`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Failure JSON numbers must be finite');
    return value;
  }
  if (typeof value !== 'object')
    throw new TypeError('Failure data must contain only JSON values');
  if (ancestors.has(value))
    throw new TypeError('Failure data must not contain cycles');
  if (++state.nodes > limits.max_nodes)
    throw new RangeError(`Failure data exceeds max_nodes ${limits.max_nodes}`);
  ancestors.add(value);
  try {
    if (Array.isArray(value))
      return Object.freeze(
        getArrayItems(value).map((item) =>
          cloneJson(
            item as FailureJsonValue,
            depth + 1,
            limits,
            ancestors,
            state,
          ),
        ),
      );
    const keys = Reflect.ownKeys(value);
    const prototype: unknown = Object.getPrototypeOf(value);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.some((key) => typeof key !== 'string')
    )
      throw new TypeError('Failure data objects must be plain JSON objects');
    const entries = keys.map((key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !('value' in descriptor)
      ) {
        throw new TypeError('Failure data must contain own enumerable fields');
      }
      return [key, descriptor.value] as const;
    });
    return Object.freeze(
      Object.fromEntries(
        entries.map(([key, item]) => [
          key,
          cloneJson(
            item as FailureJsonValue,
            depth + 1,
            limits,
            ancestors,
            state,
          ),
        ]),
      ),
    );
  } finally {
    ancestors.delete(value);
  }
};

const validateLimits = (limits: FailureLimits): void => {
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new RangeError(`${key} must be a positive safe integer`);
  }
};

const createFailure = (
  input: FailureInput,
  limits: FailureLimits,
  depth: number,
  ancestors: Set<object>,
  state: { nodes: number },
): Failure => {
  if (depth > limits.max_depth)
    throw new RangeError(
      `Failure cause graph exceeds max_depth ${limits.max_depth}`,
    );
  if (typeof input !== 'object' || input === null || Array.isArray(input))
    throw new TypeError('Failure input must be an object');
  const unknownField = Reflect.ownKeys(input).find(
    (key) =>
      typeof key === 'string' && !failureFields.some((field) => field === key),
  );
  if (unknownField !== undefined)
    throw new TypeError(
      `Failure contains unknown field ${String(unknownField)}`,
    );
  if (!hasOnlyOwnDataFields(input, failureFields, ['schema_version', 'code']))
    throw new TypeError('Failure input must contain only own data fields');
  if (ancestors.has(input))
    throw new TypeError('Failure cause graph must not contain cycles');
  if (++state.nodes > limits.max_nodes)
    throw new RangeError(
      `Failure cause graph exceeds max_nodes ${limits.max_nodes}`,
    );
  if (input.schema_version !== '1.0.0')
    throw new TypeError('Failure schema_version must be 1.0.0');
  if (typeof input.code !== 'string' || !absoluteUri.test(input.code))
    throw new TypeError('Failure code must be an absolute URI');
  if (input.message !== undefined && typeof input.message !== 'string')
    throw new TypeError('Failure message must be a string');
  if (input.message_key !== undefined && typeof input.message_key !== 'string')
    throw new TypeError('Failure message_key must be a string');
  if (input.message_key === '')
    throw new TypeError('Failure message_key must not be empty');
  const causeItems =
    input.causes === undefined
      ? undefined
      : Array.isArray(input.causes)
        ? getArrayItems(input.causes)
        : undefined;
  if (input.causes !== undefined && causeItems === undefined) {
    throw new TypeError('Failure causes must be an array');
  }
  if (causeItems !== undefined && causeItems.length > limits.max_causes) {
    throw new RangeError(
      `Failure causes must contain at most ${limits.max_causes} entries`,
    );
  }
  if (input.classification !== undefined) {
    if (
      !hasOnlyOwnDataFields(
        input.classification,
        ['category', 'severity', 'retryability'],
        [],
      )
    ) {
      throw new TypeError(
        'Failure classification must contain only own data fields',
      );
    }
    const keys = Object.keys(input.classification);
    if (
      keys.length === 0 ||
      keys.some(
        (key) => !['category', 'severity', 'retryability'].includes(key),
      )
    ) {
      throw new TypeError(
        'Failure classification must contain only known fields',
      );
    }
    if (
      input.classification.category !== undefined &&
      input.classification.category === ''
    )
      throw new TypeError('Failure classification category must not be empty');
    if (
      input.classification.severity !== undefined &&
      !severities.has(input.classification.severity)
    )
      throw new TypeError('Failure classification severity is invalid');
    if (
      input.classification.retryability !== undefined &&
      !retryabilities.has(input.classification.retryability)
    )
      throw new TypeError('Failure classification retryability is invalid');
  }
  if (
    input.extensions !== undefined &&
    Object.keys(input.extensions).some((key) => !absoluteUri.test(key))
  ) {
    throw new TypeError('Failure extension keys must be absolute URIs');
  }

  ancestors.add(input);
  try {
    const output: Record<string, unknown> = {
      schema_version: input.schema_version,
      code: input.code,
    };
    if (input.message !== undefined) output['message'] = input.message;
    if (input.message_key !== undefined)
      output['message_key'] = input.message_key;
    if (input.message_args !== undefined)
      output['message_args'] = cloneJson(
        input.message_args,
        depth + 1,
        limits,
        ancestors,
        state,
      );
    if (input.details !== undefined)
      output['details'] = cloneJson(
        input.details,
        depth + 1,
        limits,
        ancestors,
        state,
      );
    if (causeItems !== undefined)
      output['causes'] = Object.freeze(
        causeItems.map((cause) =>
          createFailure(
            cause as FailureInput,
            limits,
            depth + 1,
            ancestors,
            state,
          ),
        ),
      );
    if (input.classification !== undefined)
      output['classification'] = cloneJson(
        input.classification,
        depth + 1,
        limits,
        ancestors,
        state,
      );
    if (input.metadata !== undefined)
      output['metadata'] = cloneJson(
        input.metadata,
        depth + 1,
        limits,
        ancestors,
        state,
      );
    if (input.extensions !== undefined)
      output['extensions'] = cloneJson(
        input.extensions,
        depth + 1,
        limits,
        ancestors,
        state,
      );
    return Object.freeze(output) as Failure;
  } finally {
    ancestors.delete(input);
  }
};

/**
 * Validate, clone, and deeply freeze an optional structured Failure payload.
 * @example Failure({ schema_version: '1.0.0', code: 'urn:example:not-found' })
 * @returns A portable, deeply frozen Failure value.
 * @since 0.3.0
 */
export function Failure(
  input: FailureInput,
  limits: FailureLimits = DEFAULT_FAILURE_LIMITS,
): Failure {
  validateLimits(limits);
  return createFailure(input, limits, 0, new Set(), { nodes: 0 });
}
