import {
  andThen,
  Err,
  isErrAnd,
  isOkAnd,
  match,
  Ok,
  type ResultData,
  type ResultLike,
  unwrapOr,
  unwrapOrElse,
  type Err as ErrType,
  type Ok as OkType,
  type Result,
} from '../../src/index.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
    ? true
    : false;
type Assert<T extends true> = T;

const ok = Ok(1);
const err = Err('failure');
const data: ResultData<number, string> = { ok: true, value: 1 };
const like: ResultLike<number, string> = data;
const hydrated: Result<number, string> = Ok(1).andThen(() => data);
declare const chainSource: Result<number, 'base'>;
const chainNext = (): Result<boolean, 'next'> => Err<'next'>('next');
const methodChain = chainSource.andThen(chainNext);
const functionChain = andThen(chainSource, chainNext);
const methodAsFunction: typeof functionChain = methodChain;
const functionAsMethod: typeof methodChain = functionChain;
type AndThenSurfaceEquivalence = true;

type OkConstructorOutput = Assert<Equal<typeof ok, OkType<number>>>;
type ErrConstructorOutput = Assert<Equal<typeof err, ErrType<string>>>;

declare const result: Result<string | number, Error | string>;

if (isOkAnd(result, (value): value is string => typeof value === 'string')) {
  type NarrowedOk = Assert<Equal<typeof result, OkType<string>>>;
}

if (isErrAnd(result, (error): error is Error => error instanceof Error)) {
  type NarrowedErr = Assert<Equal<typeof result, ErrType<Error>>>;
}

if (result.isOk()) {
  const methodNarrowedOk: OkType<string | number> = result;
  void methodNarrowedOk.value;
}

if (result.isErr()) {
  const methodNarrowedErr: ErrType<Error | string> = result;
  void methodNarrowedErr.error;
}

const mapped: Result<number, Error | string> = result.map((value) =>
  typeof value === 'string' ? value.length : value,
);
const mappedErr: Result<string | number, string> = result.mapErr(String);
const chained: Result<boolean, Error | string> = result.andThen((value) =>
  Ok<boolean, Error | string>(Boolean(value)),
);
const recovered: Result<string | number, TypeError> = result.orElse(() =>
  Err<TypeError, string | number>(new TypeError('failure')),
);
const nested = Ok<Result<number, string>, string>(Ok<number, string>(1));
const flattened: Result<number, string> = nested.flatten();
const transposed = Ok<{ readonly some: true; readonly value: number }, string>({
  some: true,
  value: 1,
}).transpose();
const optionValue: number | false = Ok<number, string>(1).unwrapOr(false);
const lazyValue: number | false = Err<string, number>('failure').unwrapOrElse(
  () => false as const,
);

const matched = match(
  result,
  () => 1 as const,
  () => 'failure' as const,
);
const eagerFallback = unwrapOr(result, false as const);
const lazyFallback = unwrapOrElse(result, () => false as const);

type MatchOutput = Assert<Equal<typeof matched, 1 | 'failure'>>;
type EagerFallbackOutput = Assert<
  Equal<typeof eagerFallback, string | number | false>
>;
type LazyFallbackOutput = Assert<
  Equal<typeof lazyFallback, string | number | false>
>;

void ok;
void err;
void matched;
void eagerFallback;
void lazyFallback;
void mapped;
void mappedErr;
void chained;
void recovered;
void flattened;
void transposed;
void optionValue;
void lazyValue;
void like;
void hydrated;
void methodAsFunction;
void functionAsMethod;
export type {
  EagerFallbackOutput,
  ErrConstructorOutput,
  LazyFallbackOutput,
  MatchOutput,
  OkConstructorOutput,
  AndThenSurfaceEquivalence,
};
