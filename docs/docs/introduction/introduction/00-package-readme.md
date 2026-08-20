---
id: package-readme
title: '@resultsafe/core-fp-result - Package Documentation'
sidebar_label: Package README
description: Complete documentation for @resultsafe/core-fp-result package
---

# @resultsafe/core-fp-result

**Functional Result type for TypeScript with explicit error handling.**

- npm: [npmjs.com](https://www.npmjs.com/package/@resultsafe/core-fp-result)
- License: MIT
- TypeScript: 5.0+
- Dependencies: 0

---

## 📦 Installation

```bash
npm install @resultsafe/core-fp-result
```

Or with other package managers:

```bash
pnpm add @resultsafe/core-fp-result
yarn add @resultsafe/core-fp-result
bun add @resultsafe/core-fp-result
```

**Requirements:**

- Node.js 20.10.0+
- TypeScript 5.0.0+

---

## 🚀 Quick Start

```typescript
import { Ok, Err, match } from '@resultsafe/core-fp-result';

// Create success value
const success = Ok(42);
console.log(success); // { ok: true, value: 42 }

// Create error value
const error = Err('Something went wrong');
console.log(error); // { ok: false, error: 'Something went wrong' }

// Pattern matching
const result = Ok(10);
match(
  result,
  (value) => console.log('Success:', value),
  (error) => console.log('Error:', error),
);
```

---

## 📚 API Summary

The package root exposes Result constructors, guards, transformation and
extraction methods, pattern matching, and refinement utilities. This page is a
handwritten summary, not a generated inventory of every public export. Use the
installed package's `exports` map as the current import-surface evidence; the
mandatory direct-subpath surface is still pending complete generated exports.

See [Basic Usage](../../guides/01-basic-usage.md), [Structured
Failure](../../guides/02-structured-failure.md), and [Cause and
Exit](../../guides/03-cause-exit.md) for supported examples.

---

## 📖 Usage Guide

### Basic Usage

```typescript
import { Ok, Err, Result } from '@resultsafe/core-fp-result';

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return Err('Division by zero');
  }
  return Ok(a / b);
}

const result = divide(10, 2);

if (result.ok) {
  console.log('Result:', result.value); // 5
} else {
  console.log('Error:', result.error);
}
```

### Chaining Operations

```typescript
import { Ok } from '@resultsafe/core-fp-result';

const result = Ok(5)
  .map((x) => x * 2)
  .map((x) => x.toString())
  .unwrapOr('default');
```

### Error Recovery

```typescript
import { Ok, Err } from '@resultsafe/core-fp-result';

const result = Err('network error')
  .orElse(() => Ok(0))
  .unwrap();
```

### Pattern Matching

```typescript
import { Ok, Err, match } from '@resultsafe/core-fp-result';

const result: Result<number, string> = Ok(42);

match(
  result,
  (value) => console.log('Success:', value),
  (error) => console.log('Error:', error),
);
```

---

## 🎯 Examples

Browse [51 examples](../../examples/index.md) covering:

### Quick Start (4 examples)

- [Hello World](../../examples/00-quick-start/001-hello-world/example.md)
- [Basic Usage](../../examples/00-quick-start/002-basic-usage/example.md)
- [Error Handling](../../examples/00-quick-start/003-error-handling/example.md)
- [Chaining](../../examples/00-quick-start/004-chaining/example.md)

### API Reference (38 examples)

- [Constructors](../../examples/01-api-reference/01-constructors/01-ok/001-basic-usage/example.md)
- [Guards](../../examples/01-api-reference/02-guards/01-is-ok/001-basic-usage/example.md)
- [Methods](../../examples/01-api-reference/03-methods/01-transformation/01-map/001-basic-usage/example.md)
- [Refiners](../../examples/01-api-reference/04-refiners/01-is-typed-variant/001-basic-usage/example.md)

### Patterns (9 examples)

- [Async](../../examples/02-patterns/01-async/001-basics/example.md)
- [HTTP](../../examples/02-patterns/02-http/001-api-client/example.md)
- [Validation](../../examples/02-patterns/03-validation/001-validation/example.md)
- [Error Recovery](../../examples/02-patterns/04-error-handling/001-error-recovery/example.md)
- [Events](../../examples/02-patterns/05-events/001-event-handling/example.md)
- [Worker Pool](../../examples/02-patterns/06-workers/001-worker-pool/example.md)

---

## 🔧 Configuration

### TypeScript Configuration

Add to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## 🤝 Contributing

Contributions are welcome!

### Development

```bash
# Clone repository
git clone https://github.com/Livooon/resultsafe.git
cd resultsafe

# Install dependencies
pnpm install

# Run tests
pnpm run test

# Build
pnpm run build
```

---

## 📝 License

MIT License

---

## 🔗 Links

- [npm Package](https://www.npmjs.com/package/@resultsafe/core-fp-result)
- [GitHub Repository](https://github.com/Livooon/resultsafe)
- [Full Documentation](/)
- [Examples](../../examples/index.md)
- [Guides](../../guides/00-index.md)

---

**Version:** 0.2.1  
**Last Updated:** 2026-03-27  
**Maintainer:** Denis Savasteev
