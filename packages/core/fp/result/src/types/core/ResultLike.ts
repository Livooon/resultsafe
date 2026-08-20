import type { Err } from '../../constructors/Err.js';
import type { Ok } from '../../constructors/Ok.js';
import type { Result } from './Result.js';
import type { ErrData, OkData, ResultData } from './ResultData.js';

/** A success branch accepted at runtime or transport boundaries. @since 0.3.0 */
export type OkLike<T> = Ok<T> | OkData<T>;

/** A failure branch accepted at runtime or transport boundaries. @since 0.3.0 */
export type ErrLike<E> = Err<E> | ErrData<E>;

/**
 * A canonical runtime Result or its data-only transport representation.
 * @since 0.3.0
 */
export type ResultLike<T, E> = Result<T, E> | ResultData<T, E>;
