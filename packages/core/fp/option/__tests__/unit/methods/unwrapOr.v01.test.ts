// __tests__/methods/unwrapOr.v01.test.ts
import { None, Some, unwrapOr } from '@resultsafe/core-fp-option';
import { type Option } from '@resultsafe/core-fp-option-shared';
import { describe, expect, it } from 'vitest';

describe('unwrapOr', () => {
  // ---------------------
  // ✅ [EN] Returns value for Some
  // ✅ [RU] Возвращает значение для Some
  // ---------------------
  it('✅ [EN] returns value if Some | [RU] возвращает значение, если Some', () => {
    const input: Option<number> = Some(42);
    const result = unwrapOr(input, 0);

    expect(result).toBe(42);
  });

  // ---------------------
  // ❌ [EN] Returns default for None
  // ❌ [RU] Возвращает default для None
  // ---------------------
  it('❌ [EN] returns default if None | [RU] возвращает default, если None', () => {
    const input: Option<number> = None;
    const result = unwrapOr(input, 100);

    expect(result).toBe(100);
  });

  // ---------------------
  // 🔄 [EN] Works with strings
  // 🔄 [RU] Работает со строками
  // ---------------------
  it('🔄 [EN] returns string values | [RU] возвращает строковые значения', () => {
    const input1: Option<string> = Some('hello');
    const input2: Option<string> = None;

    const result1 = unwrapOr(input1, 'fallback');
    const result2 = unwrapOr(input2, 'fallback');

    expect(result1).toBe('hello');
    expect(result2).toBe('fallback');
  });

  // ---------------------
  // 🧪 [EN] Works with complex objects
  // 🧪 [RU] Работает со сложными объектами
  // ---------------------
  it('🧪 [EN] returns object values correctly | [RU] корректно возвращает объекты', () => {
    type User = { id: number; name: string };
    const user: User = { id: 1, name: 'Alice' };
    const defaultUser: User = { id: 0, name: 'Default' };

    const input1: Option<User> = Some(user);
    const input2: Option<User> = None;

    const result1 = unwrapOr(input1, defaultUser);
    const result2 = unwrapOr(input2, defaultUser);

    expect(result1).toBe(user);
    expect(result2).toBe(defaultUser);
  });

  // ---------------------
  // ⚡ [EN] Works with arrays
  // ⚡ [RU] Работает с массивами
  // ---------------------
  it('⚡ [EN] returns array values correctly | [RU] корректно возвращает массивы', () => {
    const input1: Option<number[]> = Some([1, 2, 3]);
    const input2: Option<number[]> = None;

    const result1 = unwrapOr(input1, []);
    const result2 = unwrapOr(input2, [0]);

    expect(result1).toEqual([1, 2, 3]);
    expect(result2).toEqual([0]);
  });

  // ---------------------
  // 🔄 [EN] Works with booleans
  // 🔄 [RU] Работает с булевыми значениями
  // ---------------------
  it('🔄 [EN] returns boolean values | [RU] возвращает булевы значения', () => {
    const input1: Option<boolean> = Some(true);
    const input2: Option<boolean> = None;

    const result1 = unwrapOr(input1, false);
    const result2 = unwrapOr(input2, false);

    expect(result1).toBe(true);
    expect(result2).toBe(false);
  });

  // ---------------------
  // 🧩 [EN] Nested Option scenario
  // 🧩 [RU] Вложенные Option
  // ---------------------
  it('🧩 [EN] unwraps nested Option correctly | [RU] корректно извлекает вложенный Option', () => {
    const nestedSome: Option<Option<string>> = Some(Some('nested'));
    const nestedNone: Option<Option<string>> = Some(None);
    const noneOption: Option<Option<string>> = None;

    const result1 = unwrapOr(nestedSome, None);
    const result2 = unwrapOr(nestedNone, Some('fallback'));
    const result3 = unwrapOr(noneOption, Some('fallback'));

    // Простая и надежная проверка через прямое сравнение структуры
    expect(result1).toEqual({ some: true, value: 'nested' });
    expect(result2).toEqual({ some: false });
    expect(result3).toEqual({ some: true, value: 'fallback' });
  });

  // ---------------------
  // 🔄 [EN] Type inference works correctly
  // 🔄 [RU] Вывод типов работает корректно
  // ---------------------
  it('🔄 [EN] TypeScript infers types correctly | [RU] TypeScript корректно выводит типы', () => {
    const input: Option<number> = None;
    const result = unwrapOr(input, 123);
    expect(result).toBe(123);
  });
});
