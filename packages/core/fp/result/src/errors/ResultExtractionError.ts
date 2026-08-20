/**
 * Error thrown when an extraction method is used on the opposite Result branch.
 *
 * @param message - A stable description of the failed extraction.
 * @param payload - The inactive branch payload, preserved as the error cause.
 * @since 0.3.0
 * @example
 * ```ts
 * import { Err, ResultExtractionError, unwrap } from '@resultsafe/core-fp-result';
 *
 * try {
 *   unwrap(Err('failure'));
 * } catch (error) {
 *   console.log(error instanceof ResultExtractionError); // true
 * }
 * ```
 * @public
 */
export class ResultExtractionError extends Error {
  public constructor(message: string, payload: unknown) {
    super(message, { cause: payload });
    this.name = 'ResultExtractionError';
  }
}
