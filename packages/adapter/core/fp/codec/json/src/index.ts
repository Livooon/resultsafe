import {
  CauseDie,
  CauseEmpty,
  CauseFail,
  CauseInterrupt,
  CauseParallel,
  CauseSequential,
  ExitFailure,
  ExitSuccess,
  Failure,
  type Cause,
  type Exit,
  type Failure as FailureValue,
  type FailureInput,
  type FailureJsonValue,
} from '@resultsafe/core-fp-result';

export interface PayloadCodec<T> {
  readonly encode: (value: T) => unknown;
  readonly decode: (value: unknown) => T;
}

export type CauseJson<E = unknown> =
  | { readonly tag: 'Empty' }
  | { readonly tag: 'Fail'; readonly error: E }
  | { readonly tag: 'Die'; readonly failure: FailureInput }
  | { readonly tag: 'Interrupt'; readonly failure: FailureInput }
  | { readonly tag: 'Sequential'; readonly left: CauseJson<E>; readonly right: CauseJson<E> }
  | { readonly tag: 'Parallel'; readonly left: CauseJson<E>; readonly right: CauseJson<E> };

export type ExitJson<T = unknown, E = unknown> =
  | { readonly tag: 'Success'; readonly value: T }
  | { readonly tag: 'Failure'; readonly cause: CauseJson<E> };

const MAX_DEPTH = 32;
const MAX_NODES = 1024;
const causeFields = {
  Empty: ['tag'],
  Fail: ['tag', 'error'],
  Die: ['tag', 'failure'],
  Interrupt: ['tag', 'failure'],
  Sequential: ['tag', 'left', 'right'],
  Parallel: ['tag', 'left', 'right'],
} as const;

type State = { nodes: number; ancestors: Set<object> };

const enter = (value: object, depth: number, state: State): void => {
  if (depth > MAX_DEPTH) throw new RangeError(`Codec graph exceeds max_depth ${MAX_DEPTH}`);
  if (state.ancestors.has(value)) throw new TypeError('Codec graph must not contain cycles');
  if (++state.nodes > MAX_NODES) throw new RangeError(`Codec graph exceeds max_nodes ${MAX_NODES}`);
  state.ancestors.add(value);
};

const exactObject = (value: unknown, fields: readonly string[]): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('Codec value must be an object');
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new TypeError('Codec value must be a plain object');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== 'string' || !fields.some((field) => field === key)))
    throw new TypeError('Codec value contains unknown or missing fields');
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor))
      throw new TypeError('Codec fields must be own enumerable data fields');
  }
  return value as Record<string, unknown>;
};

export const encodeFailure = (value: FailureValue): FailureInput => Failure(value);

export const decodeFailure = (value: unknown): FailureValue => Failure(value as FailureInput);

const encodeCauseAt = <E>(value: Cause<E>, codec: PayloadCodec<E>, depth: number, state: State): CauseJson => {
  if (typeof value !== 'object' || value === null) throw new TypeError('Cause must be an object');
  enter(value, depth, state);
  try {
    switch (value._tag) {
      case 'Empty': return Object.freeze({ tag: 'Empty' });
      case 'Fail': return Object.freeze({ tag: 'Fail', error: codec.encode(value.error) });
      case 'Die': return Object.freeze({ tag: 'Die', failure: encodeFailure(value.failure) });
      case 'Interrupt': return Object.freeze({ tag: 'Interrupt', failure: encodeFailure(value.failure) });
      case 'Sequential': return Object.freeze({ tag: 'Sequential', left: encodeCauseAt(value.left, codec, depth + 1, state), right: encodeCauseAt(value.right, codec, depth + 1, state) });
      case 'Parallel': return Object.freeze({ tag: 'Parallel', left: encodeCauseAt(value.left, codec, depth + 1, state), right: encodeCauseAt(value.right, codec, depth + 1, state) });
      default: throw new TypeError('Cause has an unknown tag');
    }
  } finally {
    state.ancestors.delete(value);
  }
};

const decodeCauseAt = <E>(value: unknown, codec: PayloadCodec<E>, depth: number, state: State): Cause<E> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Cause JSON must be an object');
  enter(value, depth, state);
  try {
    const tagDescriptor = Object.getOwnPropertyDescriptor(value, 'tag');
    if (tagDescriptor === undefined || !('value' in tagDescriptor) || typeof tagDescriptor.value !== 'string')
      throw new TypeError('Cause JSON requires a tag');
    const tag = tagDescriptor.value as keyof typeof causeFields;
    const fields = causeFields[tag];
    if (fields === undefined) throw new TypeError('Cause JSON has an unknown tag');
    const data = exactObject(value, fields);
    switch (tag) {
      case 'Empty': return CauseEmpty();
      case 'Fail': return CauseFail(codec.decode(data['error']));
      case 'Die': return CauseDie(decodeFailure(data['failure']));
      case 'Interrupt': return CauseInterrupt(decodeFailure(data['failure']));
      case 'Sequential': return CauseSequential(decodeCauseAt(data['left'], codec, depth + 1, state), decodeCauseAt(data['right'], codec, depth + 1, state));
      case 'Parallel': return CauseParallel(decodeCauseAt(data['left'], codec, depth + 1, state), decodeCauseAt(data['right'], codec, depth + 1, state));
    }
  } finally {
    state.ancestors.delete(value);
  }
};

export const encodeCause = <E>(value: Cause<E>, errorCodec: PayloadCodec<E>): CauseJson =>
  encodeCauseAt(value, errorCodec, 0, { nodes: 0, ancestors: new Set() });

export const decodeCause = <E>(value: unknown, errorCodec: PayloadCodec<E>): Cause<E> =>
  decodeCauseAt(value, errorCodec, 0, { nodes: 0, ancestors: new Set() });

export const encodeExit = <T, E>(value: Exit<T, E>, valueCodec: PayloadCodec<T>, errorCodec: PayloadCodec<E>): ExitJson => {
  if (typeof value !== 'object' || value === null) throw new TypeError('Exit must be an object');
  if (value._tag === 'Success') return Object.freeze({ tag: 'Success', value: valueCodec.encode(value.value) });
  if (value._tag === 'Failure') return Object.freeze({ tag: 'Failure', cause: encodeCauseAt(value.cause, errorCodec, 1, { nodes: 1, ancestors: new Set([value]) }) });
  throw new TypeError('Exit has an unknown tag');
};

export const decodeExit = <T, E>(value: unknown, valueCodec: PayloadCodec<T>, errorCodec: PayloadCodec<E>): Exit<T, E> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('Exit JSON must be an object');
  const tag = Object.getOwnPropertyDescriptor(value, 'tag')?.value;
  if (tag === 'Success') {
    const data = exactObject(value, ['tag', 'value']);
    return ExitSuccess(valueCodec.decode(data['value']));
  }
  if (tag === 'Failure') {
    const data = exactObject(value, ['tag', 'cause']);
    return ExitFailure(decodeCauseAt(data['cause'], errorCodec, 1, { nodes: 1, ancestors: new Set([value]) }));
  }
  throw new TypeError('Exit JSON has an unknown tag');
};

export type JsonValue = FailureJsonValue;
