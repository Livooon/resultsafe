/** Serializable success branch data. @since 0.3.0 */
export type OkData<T> = {
  readonly ok: true;
  readonly value: T;
};

/** Serializable failure branch data. @since 0.3.0 */
export type ErrData<E> = {
  readonly ok: false;
  readonly error: E;
};

/**
 * Language-neutral Result transport representation.
 *
 * This type describes only the Result wrapper. Payloads are serializable or
 * cloneable only when `T` and `E` are serializable or cloneable themselves.
 * @since 0.3.0
 */
export type ResultData<T, E> = OkData<T> | ErrData<E>;
