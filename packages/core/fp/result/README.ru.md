# @resultsafe/core-fp-result

<a id="top"></a>

> ✅ **Версия 0.1.9** | UTF-8 кодировка документации | Оптимизировано для совместной работы с ИИ

![ResultSafe Logo](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/docs/assets/logo.svg)

[![npm version](https://img.shields.io/npm/v/@resultsafe/core-fp-result.svg)](https://www.npmjs.com/package/@resultsafe/core-fp-result)
[![npm downloads](https://img.shields.io/npm/dm/@resultsafe/core-fp-result.svg)](https://www.npmjs.com/package/@resultsafe/core-fp-result)
[![license](https://img.shields.io/npm/l/@resultsafe/core-fp-result.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![docs](https://img.shields.io/badge/docs-api-informational.svg)](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/README.md)
[![build status](https://img.shields.io/badge/build-local%20verified-success.svg)](./package.json)
[![monorepo](https://img.shields.io/badge/monorepo-resultsafe%2Fmonorepo-0A0A0A.svg)](https://github.com/Livooon/resultsafe)

Rust-inspired Result-пакет для явных, композиционных и типобезопасных API в TypeScript и JavaScript.

**Язык:** [English](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/README.md) | [Русский](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/README.ru.md)

**Документация:** [API index](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/README.md) · [Modules](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/modules.md)

---

<!-- AI-AGENT: Каждый метод имеет 3 ссылки: Source (GitHub UI), Raw (код), Code (новый UI) -->
<!-- Raw ссылки лучше всего подходят для автоматизированного анализа кода и парсинга -->

## Содержание

- [Зачем нужен этот пакет](#зачем-нужен-этот-пакет)
- [Контекст monorepo](#контекст-monorepo)
- [Ключевые возможности](#ключевые-возможности)
- [Пакет](#пакет)
- [Установка](#установка)
- [Быстрый старт](#быстрый-старт)
- [Обзор основного API](#обзор-основного-api)
- [Форматы сборки и поставки](#форматы-сборки-и-поставки)
- [Структура monorepo и пакета](#структура-monorepo-и-пакета)
- [Когда использовать этот проект](#когда-использовать-этот-проект)
- [Ссылки на документацию](#ссылки-на-документацию)
- [License](#license)

---

## Зачем нужен этот пакет

`@resultsafe/core-fp-result` предоставляет явные success/error flow вместо скрытых путей управления и exception-first ветвления.

Его основной пакет, [`@resultsafe/core-fp-result`](https://www.npmjs.com/package/@resultsafe/core-fp-result), предоставляет Rust-inspired `Result` API для TypeScript и JavaScript со следующими свойствами:

- явные `Ok` / `Err`
- предсказуемая функциональная композиция
- безопасное ветвление через guards и matching
- дисциплинированные API извлечения значений
- продвинутые refinement utilities для typed variants и strict matching

Цель проекта не в механическом копировании Rust, а в переносе той же ясности намерений в Node.js-библиотеки: явные значения, предсказуемое ветвление и API, организованные для долгосрочного сопровождения.

---

## Контекст monorepo

`@resultsafe/core-fp-result` — это пакет TypeScript/JavaScript внутри мультиязычного `resultsafe/monorepo`.

Монорепозиторий применяет единый language-neutral Contract IR к language-specific проекциям. TypeScript/JavaScript является production-треком; Python runtime уже реализован и находится в staging, а не только планируется. Реализация и успешные тесты служат evidence, но сами по себе не доказывают conformance: операции между языками сопоставляются по `operation_key`, а conforming language обязан предоставлять каждую применимую операцию и как module-callable функцию, и как instance method. См. корневой [`CANON.md`](../../../../CANON.md).

---

## Ключевые возможности

- Rust-inspired модель `Result` для TypeScript и JavaScript.
- Явные конструкторы через `Ok` и `Err`.
- Композиционные трансформации через API, такие как `map`, `mapErr`, `andThen` и `orElse`.
- Безопасное ветвление через guards `isOk`, `isErr`, `isOkAnd`, `isErrAnd` и matching helpers.
- Контролируемое извлечение через `unwrap`, `unwrapOr`, `unwrapErr`, `expect` и `expectErr`.
- Продвинутый слой refiners для typed variants, strict matching и сужения результатов.
- Согласованная модульная структура вместо плоского набора утилит.
- Опциональные модели `Cause<E>` и `Exit<T, E>` без изменения generic `Result<T, E>`.
- Type output для TypeScript-пользователей для лучшего DX и более безопасных интеграций.
- Гибкие форматы поставки: Types, ESM, CJS и UMD.

---

## Пакет

Каждая нейтральная операция `Result` доступна в двух эквивалентных формах:

```ts
map(result, transform);
result.map(transform);
```

Каноническая идентичность задается `operation_key` из Contract IR, а не
конкретным именем языка. Операция `success-option` представлена как
`ok(result)` и `result.toOption()`, потому что `result.ok` уже является
обязательным boolean-дискриминатором. Полные правила описаны в
[`CANON.md`](../../../../CANON.md).

### Опциональные Cause и Exit

`Result<T, E>` остается generic: произвольные `E` по-прежнему допустимы.
`Failure` является только опциональным структурированным payload. Отдельная
модель `Cause<E>` содержит ровно шесть вариантов: `Empty`, `Fail`, `Die`,
`Interrupt`, бинарный `Sequential` и бинарный `Parallel`. `Exit<T, E>` содержит
ровно `Success` и `Failure`; значение `Exit.Failure(Cause.Empty())` допустимо.

```ts
import {
  Cause,
  Err,
  Exit,
  Failure,
  exitToResult,
  exitToResultCollapsed,
  resultToExit,
} from '@resultsafe/core-fp-result';

const interruption = Failure({
  schema_version: '1.0.0',
  code: 'urn:example:interrupted',
});
const cause = Cause.Sequential(
  Cause.Fail('write-failed'),
  Cause.Interrupt(interruption),
);
const exit = Exit.Failure(cause);

const complete = exitToResult(exit);
const collapsed = exitToResultCollapsed(exit, () => 'operation-failed');
const projected = resultToExit(Err('write-failed'));
```

Конструкторы Cause/Exit поверхностно замораживают wrapper и сохраняют identity
произвольных `T`, `E` и дочерних Cause. `exitToResult` сохраняет полный Cause, а
`exitToResultCollapsed` требует явную collapse policy. Поле `Failure.causes`
предназначено только для диагностической ancestry и не заменяет topology Cause.

Core не зависит от Effect runtime. Совместимость с Effect означает только
явные semantic adapters, а не прямую совместимость API, runtime types,
representation, wire format, identity, releases или security qualification.
Подробнее: [Cause and Exit guide](../../../../docs/docs/guides/03-cause-exit.md).

### `@resultsafe/core-fp-result`

Фокусированная Result-библиотека для явной обработки ошибок и FP-style композиции.

Она рассчитана на разработчиков, которым нужны:

- ясное моделирование успеха/ошибки
- предсказуемые трансформации
- явное ветвление и извлечение значений
- лучшая читаемость в error-heavy flow
- структурированная Rust-inspired API surface в TypeScript/JavaScript

---

## Установка

### Пакет

```bash
pnpm add @resultsafe/core-fp-result

# Альтернатива
npm install @resultsafe/core-fp-result
```

### Monorepo

```bash
pnpm install
```

---

## Быстрый старт

Типичный Result flow начинается с явных конструкторов и затем компонуется через функции, а не через неявные пути исключений.

```ts
import { Ok, map, unwrapOr } from '@resultsafe/core-fp-result';

const initial = Ok(21);
const doubled = map(initial, (value) => value * 2);
const finalValue = unwrapOr(doubled, 0);

console.log(finalValue); // 42
```

### Базовый пример `Ok` / `Err`

```ts
import { Ok, Err, match } from '@resultsafe/core-fp-result';

const parsePort = (input: string) => {
  const port = Number(input);
  return Number.isInteger(port) && port > 0
    ? Ok(port)
    : Err('Invalid port');
};

const result = parsePort('3000');
const message = match(result, (value) => `Port: ${value}`, (error) => `Error: ${error}`);

console.log(message);
```

---

## Обзор основного API

### Core Types

- [`Result<T, E>`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Result.ts) — Контейнер успеха/ошибки [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Result.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Result.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/types/core/Result.ts "Open in Code view")
- [`Option<T>`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Option.ts) — Контейнер опционального значения [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Option.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Option.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/types/core/Option.ts "Open in Code view")

### Type Helpers

- [`VariantConfig`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/VariantConfig.ts) — Конфигурация варианта [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/VariantConfig.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/VariantConfig.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/types/refiners/VariantConfig.ts "Open in Code view")
- [`PayloadKeys<T>`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/PayloadKeys.ts) — Извлечение ключей payload [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/PayloadKeys.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/PayloadKeys.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/types/refiners/PayloadKeys.ts "Open in Code view")
- [`ValidatorFn<T>`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/ValidatorFn.ts) — Синхронная функция валидатора [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/ValidatorFn.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/ValidatorFn.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/types/refiners/ValidatorFn.ts "Open in Code view")
- [`AsyncValidatorFn`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/AsyncValidatorFn.ts) — Асинхронная функция валидатора [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/AsyncValidatorFn.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/AsyncValidatorFn.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/types/refiners/AsyncValidatorFn.ts "Open in Code view")

### Constructors

- [`Ok`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Ok.ts) — Создать успешный результат [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Ok.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Ok.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/constructors/Ok.ts "Open in Code view")
- [`Err`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Err.ts) — Создать ошибочный результат [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Err.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Err.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/constructors/Err.ts "Open in Code view")

### Guards

- [`isOk`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isOk.ts) — Проверка на успех [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isOk.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isOk.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/guards/isOk.ts "Open in Code view")
- [`isErr`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isErr.ts) — Проверка на ошибку [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isErr.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isErr.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/guards/isErr.ts "Open in Code view")
- [`isOkAnd`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isOkAnd.ts) — Проверка успеха с предикатом [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isOkAnd.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isOkAnd.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/guards/isOkAnd.ts "Open in Code view")
- [`isErrAnd`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isErrAnd.ts) — Проверка ошибки с предикатом [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isErrAnd.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isErrAnd.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/guards/isErrAnd.ts "Open in Code view")

### Methods

#### Transformation

- [`map`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/map.ts) — Трансформация успешного значения [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/map.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/map.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/map.ts "Open in Code view")
- [`mapErr`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/mapErr.ts) — Трансформация значения ошибки [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/mapErr.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/mapErr.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/mapErr.ts "Open in Code view")

#### Chaining

- [`andThen`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/andThen.ts) — Цепочка вычислений, возвращающих Result [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/andThen.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/andThen.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/andThen.ts "Open in Code view")
- [`orElse`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/orElse.ts) — Восстановление после ошибки [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/orElse.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/orElse.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/orElse.ts "Open in Code view")

#### Extraction

- [`unwrap`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrap.ts) — Извлечь значение или выбросить [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrap.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrap.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/unwrap.ts "Open in Code view")
- [`unwrapOr`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapOr.ts) — Извлечь значение или default [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapOr.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapOr.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/unwrapOr.ts "Open in Code view")
- [`unwrapOrElse`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapOrElse.ts) — Извлечь значение или вычислить default [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapOrElse.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapOrElse.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/unwrapOrElse.ts "Open in Code view")
- [`unwrapErr`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapErr.ts) — Извлечь ошибку или выбросить [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapErr.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapErr.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/unwrapErr.ts "Open in Code view")
- [`expect`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/expect.ts) — Извлечь значение или выбросить с сообщением [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/expect.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/expect.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/expect.ts "Open in Code view")
- [`expectErr`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/expectErr.ts) — Извлечь ошибку или выбросить с сообщением [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/expectErr.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/expectErr.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/expectErr.ts "Open in Code view")

#### Side Effects

- [`tap`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tap.ts) — Побочный эффект на успехе [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tap.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tap.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/tap.ts "Open in Code view")
- [`tapErr`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tapErr.ts) — Побочный эффект на ошибке [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tapErr.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tapErr.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/tapErr.ts "Open in Code view")
- [`inspect`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/inspect.ts) — Отладка на успехе [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/inspect.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/inspect.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/inspect.ts "Open in Code view")
- [`inspectErr`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/inspectErr.ts) — Отладка на ошибке [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/inspectErr.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/inspectErr.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/inspectErr.ts "Open in Code view")

#### Advanced

- [`match`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/match.ts) — Pattern matching [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/match.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/match.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/match.ts "Open in Code view")
- [`flatten`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/flatten.ts) — Схлопывание вложенного Result [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/flatten.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/flatten.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/flatten.ts "Open in Code view")
- [`transpose`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/transpose.ts) — Result<Option> → Option<Result> [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/transpose.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/transpose.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/transpose.ts "Open in Code view")
- [`ok`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/ok.ts) — Конвертировать в Option (успех) [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/ok.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/ok.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/ok.ts "Open in Code view")
- [`err`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/err.ts) — Конвертировать в Option (ошибка) [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/err.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/err.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/methods/err.ts "Open in Code view")

### Refiners

- [`isTypedVariant`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/isTypedVariant.ts) — Type guard для варианта [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/isTypedVariant.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/isTypedVariant.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/isTypedVariant.ts "Open in Code view")
- [`isTypedVariantOf`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/isTypedVariantOf.ts) — Type guard с картой вариантов [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/isTypedVariantOf.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/isTypedVariantOf.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/isTypedVariantOf.ts "Open in Code view")
- [`matchVariant`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariant.ts) — Match варианта с обработчиками [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariant.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariant.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/matchVariant.ts "Open in Code view")
- [`matchVariantStrict`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariantStrict.ts) — Строгий match варианта [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariantStrict.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariantStrict.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/matchVariantStrict.ts "Open in Code view")
- [`refineAsyncResult`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineAsyncResult.ts) — Асинхронное уточнение результата [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineAsyncResult.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineAsyncResult.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/refineAsyncResult.ts "Open in Code view")
- [`refineAsyncResultU`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineAsyncResultU.ts) — Асинхронное уточнение (некаррированное) [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineAsyncResultU.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineAsyncResultU.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/refineAsyncResultU.ts "Open in Code view")
- [`refineResult`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineResult.ts) — Синхронное уточнение результата [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineResult.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineResult.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/refineResult.ts "Open in Code view")
- [`refineResultU`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineResultU.ts) — Синхронное уточнение (некаррированное) [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineResultU.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineResultU.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/refineResultU.ts "Open in Code view")
- [`refineVariantMap`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineVariantMap.ts) — Уточнение карты вариантов [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineVariantMap.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineVariantMap.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/refineVariantMap.ts "Open in Code view")

### Type Aliases

- [`Handler`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/Handler.ts) — Тип обработчика match [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/Handler.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/Handler.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/Handler.ts "Open in Code view")
- [`MatchBuilder`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/MatchBuilder.ts) — Тип построителя match [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/MatchBuilder.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/MatchBuilder.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/MatchBuilder.ts "Open in Code view")
- [`Matcher`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/Matcher.ts) — Тип функции match [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/Matcher.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/Matcher.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/Matcher.ts "Open in Code view")
- [`SyncRefinedResult`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncRefinedResult.ts) — Синхронный уточнённый результат [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncRefinedResult.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncRefinedResult.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/SyncRefinedResult.ts "Open in Code view")
- [`SyncRefinedResultUnion`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncRefinedResultUnion.ts) — Объединение уточнённых результатов [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncRefinedResultUnion.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncRefinedResultUnion.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/SyncRefinedResultUnion.ts "Open in Code view")
- [`SyncValidatorMap`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncValidatorMap.ts) — Тип карты валидаторов [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncValidatorMap.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/SyncValidatorMap.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/SyncValidatorMap.ts "Open in Code view")
- [`UniversalAsyncRefinedResult`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/UniversalAsyncRefinedResult.ts) — Асинхронный уточнённый результат [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/UniversalAsyncRefinedResult.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/UniversalAsyncRefinedResult.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/UniversalAsyncRefinedResult.ts "Open in Code view")
- [`UniversalRefinedResult`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/UniversalRefinedResult.ts) — Универсальный уточнённый результат [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/UniversalRefinedResult.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/UniversalRefinedResult.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/UniversalRefinedResult.ts "Open in Code view")
- [`VariantOf`](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/VariantOf.ts) — Вспомогательный тип варианта [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/VariantOf.ts "View on GitHub") · [🔗](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/types/VariantOf.ts "View raw code") · [💻](https://github.com/Livooon/resultsafe/code/main/packages/core/fp/result/src/refiners/types/VariantOf.ts "Open in Code view")

---

## Форматы сборки и поставки

- Types: `build:types`
- ESM: `build:esm`
- CJS: `build:cjs`
- UMD: `build:umd`

Пакет публикует typed declarations и несколько runtime-форматов модулей для широкой совместимости.

---

## Структура monorepo и пакета

```txt
src/
  constructors/
  guards/
  methods/
  refiners/
    types/
    utils/
  internal/
  index.ts
```

---

## Когда использовать этот проект

Используйте проект, если вам нужны:

- явное моделирование успеха/ошибки
- предсказуемая FP-style композиция
- видимый control flow
- более сильная type-guided обработка результатов в TypeScript
- продвинутые refinement tools для typed variants и строгого result matching

---

## Ссылки на документацию

- [API entry (README)](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/README.md)
- [API entry (index)](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/index.md)
- [Modules](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/modules.md)
- [Constructors module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/constructors/index.md)
- [Guards module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/guards/index.md)
- [Methods module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/methods/index.md)
- [Refiners module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/refiners/index.md)
- [Type aliases module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/type-aliases/index.md)

---

Наверх: [@resultsafe/core-fp-result](#top)

---

## Author

Denis Savasteev

---

## License

[MIT](./LICENSE)
