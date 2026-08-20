---
id: 03-quick-start
title: Quick Start
sidebar_label: Quick Start
description: Get started with ResultSafe in 5 minutes
---

# Quick Start

Get started with ResultSafe in 5 minutes.

## 1. Create a Result

```typescript
import { Ok, Err } from '@resultsafe/core-fp-result';

// Success value
const success = Ok(42);
console.log(success); // { ok: true, value: 42 }

// Error value
const error = Err('Something went wrong');
console.log(error); // { ok: false, error: 'Something went wrong' }
```

## 2. Pattern Matching

```typescript
import { match } from '@resultsafe/core-fp-result';

const result = Ok(42);

match(
  result,
  (value) => console.log('Success:', value),
  (error) => console.log('Error:', error)
);
```

## 3. Transform Values

```typescript
import { Ok } from '@resultsafe/core-fp-result';

const result = Ok(5)
  .map(x => x * 2)        // Ok(10)
  .map(x => x.toString()); // Ok("10")
```

## 4. Chain Operations

```typescript
import { Ok, Err } from '@resultsafe/core-fp-result';

const result = Ok(10)
  .andThen(x => Ok(x * 2))  // Ok(20)
  .unwrapOr(0);              // 20

const error = Err('failed')
  .andThen(x => Ok(x * 2))  // Still Err('failed')
  .unwrapOr(0);              // 0 (fallback)
```

## 5. Handle Errors

```typescript
import { Ok, Err } from '@resultsafe/core-fp-result';

const divide = (a: number, b: number) => {
  if (b === 0) {
    return Err('Division by zero');
  }
  return Ok(a / b);
};

const result = divide(10, 2);

if (result.ok) {
  console.log('Result:', result.value);
} else {
  console.log('Error:', result.error);
}
```

## Next Steps

- [Basic Usage](../../guides/01-basic-usage.md) - Deep dive
- [Structured Failure](../../guides/02-structured-failure.md) - Portable error payloads
- [Package Documentation](./00-package-readme.md) - API summary and examples
