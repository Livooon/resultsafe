export type OkData<T> = { readonly ok: true; readonly value: T };
export type ErrData<E> = { readonly ok: false; readonly error: E };
export type ResultData<T, E> = OkData<T> | ErrData<E>;

/** @deprecated Use ResultData. This package contains transport types only. */
export type Result<T, E> = ResultData<T, E>;
