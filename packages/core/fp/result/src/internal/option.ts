/** Represents an empty internal option value. @internal */
export const None = Object.freeze({ some: false } as const);

/** Wraps an internal option value as present. @internal */
export const Some = <T>(value: T) => ({ some: true, value }) as const;
