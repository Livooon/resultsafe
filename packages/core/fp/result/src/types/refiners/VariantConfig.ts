/**
 * Configuration options for variant validation.
 *
 * @remarks
 * Used to configure how variants are validated, including payload keys
 * and field strictness.
 *
 * @example
 * ```ts
 * import { VariantConfig } from '@resultsafe/core-fp-result';
 *
 * const config: VariantConfig = {
 *   payload: ['name', 'age'],
 *   forbidden: 'id',
 *   strictFields: true
 * };
 * ```
 *
 * @since 0.1.8
 * @public
 */
/** @deprecated Use an empty payload key array (`[]`) instead. */
type LegacyEmptyPayload = 'never';

export interface VariantConfig {
  readonly payload: LegacyEmptyPayload | string | readonly string[];
  readonly forbidden?: string | readonly string[] | undefined;
  readonly strictFields?: boolean | undefined;
}
