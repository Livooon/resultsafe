// __tests__/methods/transpose.v01.test.ts
import { None, Some, transpose } from '@resultsafe/core-fp-option';
import { type Option } from '@resultsafe/core-fp-option-shared';
import { type Result } from '@resultsafe/core-fp-result-shared';
import { describe, expect, it } from 'vitest';

describe('transpose', () => {
  // ---------------------
  // ✅ [EN] Some(Ok) → Ok(Some)
  // ✅ [RU] Some(Ok) → Ok(Some)
  // ---------------------
  it('✅ [EN] converts Some(Ok) to Ok(Some) | [RU] преобразует Some(Ok) в Ok(Some)', () => {
    const input: Option<Result<number, string>> = Some({ ok: true, value: 42 });
    const result = transpose(input);

    expect(result.ok).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(typeof result.map).toBe('function');
    if (result.ok) {
      expect(result.value.some).toBe(true);
      if (result.value.some === true) {
        expect(result.value.value).toBe(42);
      }
    }
  });

  // ---------------------
  // ❌ [EN] Some(Err) → Err
  // ❌ [RU] Some(Err) → Err
  // ---------------------
  it('❌ [EN] converts Some(Err) to Err | [RU] преобразует Some(Err) в Err', () => {
    const input: Option<Result<number, string>> = Some({
      ok: false,
      error: 'fail',
    });
    const result = transpose(input);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('fail');
    }
  });

  // ---------------------
  // 🟢 [EN] None → Ok(None)
  // 🟢 [RU] None → Ok(None)
  // ---------------------
  it('🟢 [EN] converts None to Ok(None) | [RU] преобразует None в Ok(None)', () => {
    const input: Option<Result<number, string>> = None;
    const result = transpose(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some).toBe(false);
    }
  });

  // ---------------------
  // 🔄 [EN] Nested Option with string
  // 🔄 [RU] Вложенный Option со строкой
  // ---------------------
  it('🔄 [EN] maps Some(Ok(string)) | [RU] преобразует Some(Ok(string))', () => {
    const input: Option<Result<string, string>> = Some({
      ok: true,
      value: 'hello',
    });
    const result = transpose(input);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.some === true) {
      const mapped = Some(result.value.value.toUpperCase());
      expect(mapped.some).toBe(true);
      if (mapped.some === true) {
        expect(mapped.value).toBe('HELLO');
      }
    }
  });

  // ---------------------
  // 🧪 [EN] Type inference with generics
  // 🧪 [RU] Вывод типов с дженериками
  // ---------------------
  it('🧪 [EN] works with generic Result inside Option | [RU] работает с дженерик Result внутри Option', () => {
    type Data = { id: number; name: string };
    const input: Option<Result<Data, string>> = Some({
      ok: true,
      value: { id: 1, name: 'Alice' },
    });
    const result = transpose(input);

    expect(result.ok).toBe(true);
    if (result.ok && result.value.some === true) {
      expect(result.value.value.id).toBe(1);
      expect(result.value.value.name).toBe('Alice');
    }
  });

  // ---------------------
  // 🔄 [EN] None of Result type
  // 🔄 [RU] None с Result
  // ---------------------
  it('🔄 [EN] None of Result maps to Ok(None) | [RU] None с Result → Ok(None)', () => {
    const input: Option<Result<number, string>> = None;
    const result = transpose(input);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some).toBe(false);
    }
  });
});

