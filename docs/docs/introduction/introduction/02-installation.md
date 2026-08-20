---
id: 02-installation
title: Installation
sidebar_label: Installation
description: How to install ResultSafe in your project
---

# Installation

## npm

```bash
npm install @resultsafe/core-fp-result
```

## pnpm

```bash
pnpm add @resultsafe/core-fp-result
```

## yarn

```bash
yarn add @resultsafe/core-fp-result
```

## bun

```bash
bun add @resultsafe/core-fp-result
```

## Requirements

- **Node.js:** 20.10.0 or higher
- **TypeScript:** 5.0.0 or higher
- **Package Manager:** pnpm 10.0.0+ (recommended)

## Usage

After installation, import the library:

```typescript
// ESM (recommended)
import { Ok, Err, Result } from '@resultsafe/core-fp-result';

// CommonJS
const { Ok, Err, Result } = require('@resultsafe/core-fp-result');
```

## Next Steps

- [Quick Start](./03-quick-start.md) - Get started in 5 minutes
- [Basic Usage](../../guides/01-basic-usage.md) - Learn the fundamentals
