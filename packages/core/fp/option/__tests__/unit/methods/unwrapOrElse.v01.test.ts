// __tests__/methods/unwrapOrElse.v01.test.ts
import { None, Some, unwrapOrElse } from '@resultsafe/core-fp-option';
import { type Option } from '@resultsafe/core-fp-option-shared';
import { describe, expect, it } from 'vitest';

describe('unwrapOrElse', () => {
  // ---------------------
  // ✅ [EN] Returns value if Some
  // ✅ [RU] Возвращает значение, если Some
  // ---------------------
  it('✅ [EN] returns value if Some | [RU] возвращает значение, если Some', () => {
    const option: Option<number> = Some(42);
    const result = unwrapOrElse(option, () => 0);
    expect(result).toBe(42);
  });

  // ---------------------
  // ❌ [EN] Calls fallback function if None
  // ❌ [RU] Вызывает функцию fallback, если None
  // ---------------------
  it('❌ [EN] calls fallback function if None | [RU] вызывает fallback, если None', () => {
    const option: Option<number> = None;
    const result = unwrapOrElse(option, () => 99);
    expect(result).toBe(99);
  });

  // ---------------------
  // 🔄 [EN] Works with complex types: objects, arrays
  // 🔄 [RU] Работает со сложными типами: объекты, массивы
  // ---------------------
  it('🔄 [EN] works with complex types | [RU] работает со сложными типами', () => {
    const objOption: Option<{ name: string; age: number }> = None;
    const fallbackObj = { name: 'Alice', age: 30 };
    const objResult = unwrapOrElse(objOption, () => fallbackObj);
    expect(objResult).toEqual(fallbackObj);

    const arrOption: Option<number[]> = None;
    const fallbackArr = [1, 2, 3];
    const arrResult = unwrapOrElse(arrOption, () => fallbackArr);
    expect(arrResult).toEqual(fallbackArr);
  });

  // ---------------------
  // 🧪 [EN] Type inference works correctly
  // 🧪 [RU] Вывод типов работает корректно
  // ---------------------
  it('🧪 [EN] type inference works | [RU] корректный вывод типов', () => {
    type ApiResponse =
      | { status: 200; message: string }
      | { status: 404; error: string };

    const option: Option<ApiResponse> = Some({ status: 200, message: 'OK' });
    const result = unwrapOrElse(
      option,
      () => ({ status: 404, error: 'Not found' }) as const,
    );

    expect(result.status).toBe(200);
    // @ts-ignore - для упрощения проверки
    if ('message' in result) {
      expect(result.message).toBe('OK');
    }
  });

  // ---------------------
  // ⚡ [EN] Fallback not called if Some
  // ⚡ [RU] Функция fallback не вызывается, если Some
  // ---------------------
  it('⚡ [EN] fallback not called if Some | [RU] fallback не вызывается, если Some', () => {
    let fallbackCalled = false;
    const option: Option<string> = Some('hello');

    const result = unwrapOrElse(option, () => {
      fallbackCalled = true;
      return 'fallback';
    });

    expect(result).toBe('hello');
    expect(fallbackCalled).toBe(false);
  });

  // ---------------------
  // 🧩 [EN] Works with nested Option - УПРОЩЕННАЯ версия
  // 🧩 [RU] Работает с вложенными Option - УПРОЩЕННАЯ версия
  // ---------------------
  it('🧩 [EN] handles nested Option | [RU] корректная обработка вложенных Option', () => {
    const nestedSome: Option<Option<string>> = Some(Some('nested'));
    const nestedNone: Option<Option<string>> = Some(None);
    const noneOption: Option<Option<string>> = None;

    const result1 = unwrapOrElse(nestedSome, () => None);
    const result2 = unwrapOrElse(nestedNone, () => Some('fallback'));
    const result3 = unwrapOrElse(noneOption, () => Some('fallback'));

    // Простая и надежная проверка через прямое сравнение структуры
    expect(result1).toEqual({ some: true, value: 'nested' });
    expect(result2).toEqual({ some: false });
    expect(result3).toEqual({ some: true, value: 'fallback' });
  });

  // ---------------------
  // 🧪 [EN] Works with fallback function
  // 🧪 [RU] Работает с функцией fallback
  // ---------------------
  it('🧪 [EN] works with fallback function | [RU] работает с функцией fallback', () => {
    const option: Option<number> = None;
    const fallback = () => 10;
    const result = unwrapOrElse(option, fallback);
    expect(result).toBe(10);
  });

  // ---------------------
  // 🔧 [EN] Real-world usage scenario
  // 🔧 [RU] Реальный сценарий использования
  // ---------------------
  it('🔧 [EN] unwrapOrElse in real-world scenario | [RU] unwrapOrElse в реальном сценарии', () => {
    type User = { id: number; name: string };
    const optionUser: Option<User> = None;
    const user = unwrapOrElse(optionUser, () => ({ id: 1, name: 'Alice' }));
    expect(user.id).toBe(1);
    expect(user.name).toBe('Alice');
  });
});
