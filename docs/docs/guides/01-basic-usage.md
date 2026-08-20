---
id: basic-usage
title: Basic Usage
sidebar_label: Basic Usage
description: Learn the core concepts of ResultSafe
---

# Basic Usage

Learn the fundamental concepts of ResultSafe.

## Creating Result Values

### Ok - Success Value

```typescript
import { Ok } from '@resultsafe/core-fp-result';

// Simple value
const success = Ok(42);
// { ok: true, value: 42 }

// With type annotation
const typed: Ok<number, string> = Ok(42);

// Object value
const user = Ok({ id: 1, name: 'John' });
```

### Err - Error Value

```typescript
import { Err } from '@resultsafe/core-fp-result';

// Simple error
const error = Err('Something went wrong');
// { ok: false, error: 'Something went wrong' }

// With custom error type
const typed: Err<string, number> = Err(500);

// Error object
const complex = Err({ code: 500, message: 'Server error' });
```

## Checking Result

### Using Guards

```typescript
import { Ok, Err, isOk, isErr } from '@resultsafe/core-fp-result';

const result = Ok(42);

if (isOk(result)) {
  console.log(result.value); // TypeScript knows it's Ok
}

if (isErr(result)) {
  console.log(result.error); // TypeScript knows it's Err
}
```

### Using Pattern Matching

```typescript
import { match } from '@resultsafe/core-fp-result';

const result = Ok(42);

match(
  result,
  (value) => console.log('Success:', value),
  (error) => console.log('Error:', error)
);
```

## Next Steps

- [Structured Failure](./02-structured-failure.md) - Add an optional portable error payload
- [Cause and Exit](./03-cause-exit.md) - Preserve defects, interruptions, and composition
- [Patterns](../patterns/00-index.md) - Real-world examples
- [Package Documentation](../introduction/introduction/00-package-readme.md) - API summary
