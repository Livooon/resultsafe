import type { AsyncValidatorFn } from '../types/refiners/AsyncValidatorFn.js';
import type { ValidatorFn } from '../types/refiners/ValidatorFn.js';
import type { VariantConfig } from '../types/refiners/VariantConfig.js';

type RuntimeConfig = VariantConfig & { readonly payload: unknown };
type RuntimeMap = Readonly<Record<string, RuntimeConfig | undefined>>;
type RuntimeValidators = Readonly<Record<string, unknown>>;

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const payloadKeys = (config: RuntimeConfig): readonly string[] | null => {
  if (!hasOwn(config, 'payload')) return null;
  const payload = config.payload;
  if (payload === 'never') return [];
  if (typeof payload === 'string') return [payload];
  if (
    Array.isArray(payload) &&
    payload.every((key) => typeof key === 'string')
  ) {
    return payload;
  }
  return null;
};

const forbiddenKeys = (config: RuntimeConfig): readonly string[] | null => {
  if (!hasOwn(config, 'forbidden')) return [];
  const forbidden = config.forbidden;
  if (forbidden === undefined) return [];
  if (typeof forbidden === 'string') return [forbidden];
  if (
    Array.isArray(forbidden) &&
    forbidden.every((key) => typeof key === 'string')
  ) {
    return forbidden;
  }
  return null;
};

const prepareValidation = (
  value: unknown,
  variant: string,
  variantMap: RuntimeMap,
): {
  readonly value: Record<string, unknown>;
  readonly keys: readonly string[];
} | null => {
  if (typeof value !== 'object' || value === null || !hasOwn(value, 'type')) {
    return null;
  }
  if (typeof variantMap !== 'object' || variantMap === null) return null;
  const object = value as Record<string, unknown>;
  if (object['type'] !== variant || !hasOwn(variantMap, variant)) return null;

  const config = variantMap[variant];
  if (typeof config !== 'object' || config === null) return null;
  const keys = payloadKeys(config);
  const forbidden = forbiddenKeys(config);
  if (!keys || !forbidden) return null;

  for (const key of keys) {
    if (!hasOwn(object, key)) return null;
  }
  for (const key of forbidden) {
    if (hasOwn(object, key)) return null;
  }
  const hasStrictFields = hasOwn(config, 'strictFields');
  if (
    hasStrictFields &&
    config.strictFields !== undefined &&
    typeof config.strictFields !== 'boolean'
  ) {
    return null;
  }
  if (hasStrictFields && config.strictFields === true) {
    const allowed = new Set(['type', ...keys]);
    if (Reflect.ownKeys(object).some((key) => !allowed.has(key as string))) {
      return null;
    }
  }

  return { value: object, keys };
};

/**
 * Shared synchronous runtime semantics for all map-based refiners.
 * @since 0.3.0
 * @internal
 */
export const validateSync = (
  value: unknown,
  variant: string,
  variantMap: RuntimeMap,
  validators: RuntimeValidators,
): Record<string, unknown> | null => {
  const prepared = prepareValidation(value, variant, variantMap);
  if (!prepared) return null;
  if (typeof validators !== 'object' || validators === null) return null;

  for (const key of prepared.keys) {
    if (!hasOwn(validators, key)) continue;
    const validator = validators[key];
    if (typeof validator !== 'function') return null;
    if (!(validator as ValidatorFn)(prepared.value[key])) return null;
  }
  return prepared.value;
};

/**
 * Shared asynchronous runtime semantics for all async refiners.
 * @since 0.3.0
 * @internal
 */
export const validateAsync = async (
  value: unknown,
  variant: string,
  variantMap: RuntimeMap,
  validators: RuntimeValidators,
): Promise<Record<string, unknown> | null> => {
  const prepared = prepareValidation(value, variant, variantMap);
  if (!prepared) return null;
  if (typeof validators !== 'object' || validators === null) return null;

  for (const key of prepared.keys) {
    if (!hasOwn(validators, key)) continue;
    const validator = validators[key];
    if (typeof validator !== 'function') return null;
    if (!(await (validator as AsyncValidatorFn)(prepared.value[key])))
      return null;
  }
  return prepared.value;
};
