---
id: 01-overview
title: Overview
sidebar_label: Overview
description: Introduction to ResultSafe - Functional Result type for TypeScript
---

# ResultSafe

**Functional Result type for TypeScript with explicit error handling.**

## Features

- ✅ **Type-safe error handling** - Catch errors at compile time
- ✅ **Rust-style Result** - Familiar API for Rust developers
- **Zero runtime dependencies** - Lightweight core without integration baggage
- ✅ **AI-friendly** - Comprehensive documentation for LLMs
- ✅ **Multi-language** - English and Russian support

## Quick Example

```typescript
import { Ok, Err, match } from '@resultsafe/core-fp-result';

const divide = (a: number, b: number) => {
  if (b === 0) {
    return Err('Division by zero');
  }
  return Ok(a / b);
};

const result = divide(10, 2);
match(
  result,
  (value) => console.log(value), // 5
  (error) => console.error(error)
);
```

## Installation

```bash
npm install @resultsafe/core-fp-result
```

## Lightweight core invariant

Core must retain zero runtime dependencies. Every public module is required to
be available from both the package root and a direct package subpath, and
optional integrations such as codecs, Effect adapters, and storage must remain
separate. Complete generated subpath exports are still pending, so only use a
direct subpath that is present in the installed package's `exports` map.

## Next Steps

- [Installation](./02-installation.md) - Setup guide
- [Quick Start](./03-quick-start.md) - Get started in 5 minutes
- [Package Documentation](./00-package-readme.md) - API summary and examples

## Learn More

- [Guides](../../guides/00-index.md) - Usage patterns
- [Patterns](../../patterns/00-index.md) - Real-world examples
- [GitHub](https://github.com/resultsafe/resultsafe) - Source code
