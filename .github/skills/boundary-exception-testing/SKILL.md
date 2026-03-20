---
name: boundary-exception-testing
description: "Use when: writing or reviewing test cases, testing functions with input constraints, or ensuring exception handling. Identifies and tests boundary values and edge cases systematically for comprehensive test coverage."
---

# 경계값 및 예외 상황 테스트 스킬

테스트에서 가장 중요한 것은 **정상 케이스만이 아니라 경계값과 예외 상황까지 철저히 테스트**하는 것입니다.

---

## 개념 이해

### 경계값 (Boundary Values)이란?

경계값은 입력값의 유효 범위의 끝점과 주변값들입니다. 소프트웨어 결함은 경계에서 주로 발생합니다.

```
범위: 1 ≤ age ≤ 120

경계값:
  - 최소값: 1
  - 최소값 직전: 0
  - 최소값 직후: 2
  - 최대값: 120
  - 최대값 직전: 119
  - 최대값 직후: 121
```

**대표적 경계값 시나리오:**
| 시나리오 | 예제 |
|---------|------|
| 길이 0 | 빈 문자열, 빈 배열 |
| 길이 1 | 한 글자, 한 요소 |
| 정수 범위 | -2147483648, 2147483647 |
| 실수 범위 | 0.0, 음수, 매우 작은 값, 매우 큰 값 |
| 컬렉션 | 빈 컬렉션, 1개 요소, 많은 요소 |
| 타입-경계 | null, undefined, NaN, Infinity |

---

### 예외 상황 (Exception Cases)이란?

예외 상황은 함수가 처리해야 하는 비정상적 입력이나 상태입니다.

**카테고리:**

1. **입력 검증 실패**
   ```javascript
   // 예: 필수 파ラ미터 누락
   calculate(undefined, 5);
   calculate(null, 5);
   ```

2. **유효 범위 벗어남**
   ```javascript
   // 예: age는 0-150 사이여야 함
   setAge(-1);
   setAge(200);
   ```

3. **타입 불일치**
   ```javascript
   // 예: 숫자 기대, 문자열 받음
   add("10", "20");
   add({}, []);
   ```

4. **무한/특수값**
   ```javascript
   divide(10, 0);  // Infinity
   sqrt(-1);       // NaN
   ```

5. **리소스 부족**
   ```javascript
   // 파일 못 열기, DB 연결 실패, 메모리 부족
   ```

6. **상태 오류**
   ```javascript
   // 초기화 전 사용, 이미 닫힘
   writer.write();  // 초기화 전
   file.read();     // 닫힌 파일
   ```

---

## 경계값 테스트 전략

### Step 1: 입력 범위 식별

함수의 모든 입력 파라미터와 그 제약 조건을 명시합니다.

```javascript
/**
 * 나이 검증 함수
 * @param {number} age - 나이 (1 ~ 150)
 * @param {string} name - 이름 (1~50자)
 * @returns {boolean} 유효하면 true
 */
function isValidAge(age, name) {
  return age >= 1 && age <= 150 && name && name.length <= 50;
}

// 입력 범위:
// - age: 정수, 1 ~ 150
// - name: 문자열, 1 ~ 50자
```

### Step 2: 경계값 후보 추출

각 범위마다 경계값 후보를 추출합니다.

```javascript
// age의 경계값 (1 ~ 150):
const ageBoundaries = [
  { value: -1, desc: '최소값 범위 초과' },
  { value: 0, desc: '최소값 직전' },
  { value: 1, desc: '유효 최소값' },
  { value: 2, desc: '최소값 직후' },
  { value: 75, desc: '중간값' },
  { value: 149, desc: '최대값 직전' },
  { value: 150, desc: '유효 최대값' },
  { value: 151, desc: '최대값 초과' },
  { value: 1000, desc: '범위 훨씬 초과' }
];

// name의 경계값 (1 ~ 50자):
const nameBoundaries = [
  { value: '', desc: '빈 문자열' },
  { value: 'a', desc: '1자 (최소)' },
  { value: 'A'.repeat(50), desc: '50자 (최대)' },
  { value: 'A'.repeat(51), desc: '51자 (초과)' }
];
```

### Step 3: 경계값 테스트 작성

```javascript
describe('isValidAge - 경계값 테스트', () => {
  // age 경계값 테스트
  describe('age 범위 (1 ~ 150)', () => {
    test('should reject age 0 (직전)', () => {
      expect(isValidAge(0, 'John')).toBe(false);
    });

    test('should accept age 1 (최소값)', () => {
      expect(isValidAge(1, 'John')).toBe(true);
    });

    test('should accept age 2 (직후)', () => {
      expect(isValidAge(2, 'John')).toBe(true);
    });

    test('should accept age 75 (중간)', () => {
      expect(isValidAge(75, 'John')).toBe(true);
    });

    test('should accept age 149 (직전)', () => {
      expect(isValidAge(149, 'John')).toBe(true);
    });

    test('should accept age 150 (최대값)', () => {
      expect(isValidAge(150, 'John')).toBe(true);
    });

    test('should reject age 151 (초과)', () => {
      expect(isValidAge(151, 'John')).toBe(false);
    });
  });

  // name 경계값 테스트
  describe('name 길이 (1 ~ 50자)', () => {
    test('should reject empty name', () => {
      expect(isValidAge(25, '')).toBe(false);
    });

    test('should accept 1-character name', () => {
      expect(isValidAge(25, 'a')).toBe(true);
    });

    test('should accept 50-character name', () => {
      expect(isValidAge(25, 'A'.repeat(50))).toBe(true);
    });

    test('should reject 51-character name', () => {
      expect(isValidAge(25, 'A'.repeat(51))).toBe(false);
    });
  });
});
```

---

## 예외 상황 테스트 전략

### Step 1: 예외 상황 카테고리화

체계적으로 예외 상황을 분류합니다.

```javascript
/**
 * 배열 합계 계산
 * @param {number[]} numbers - 숫자 배열
 * @returns {number} 합계
 */
function sumArray(numbers) {
  if (!Array.isArray(numbers)) {
    throw new TypeError('Input must be an array');
  }
  if (numbers.length === 0) {
    throw new Error('Array cannot be empty');
  }
  return numbers.reduce((sum, n) => sum + n, 0);
}

// 예외 상황:
// 1. 입력 검증: null, undefined, 비배열
// 2. 크기: 빈 배열, 매우 큰 배열
// 3. 요소: 문자열, null, undefined, NaN
// 4. 환경: 스택 오버플로우, 성능
```

### Step 2: 예외 상황별 테스트

```javascript
describe('sumArray - 예외 상황 테스트', () => {
  // 1. 입력 검증 오류
  describe('입력 검증', () => {
    test('should throw TypeError for null input', () => {
      expect(() => sumArray(null)).toThrow(TypeError);
    });

    test('should throw TypeError for undefined input', () => {
      expect(() => sumArray(undefined)).toThrow(TypeError);
    });

    test('should throw TypeError for string input', () => {
      expect(() => sumArray('1,2,3')).toThrow(TypeError);
    });

    test('should throw TypeError for object input', () => {
      expect(() => sumArray({ 0: 1, 1: 2 })).toThrow(TypeError);
    });
  });

  // 2. 크기 관련
  describe('배열 크기', () => {
    test('should throw Error for empty array', () => {
      expect(() => sumArray([])).toThrow('Array cannot be empty');
    });

    test('should handle single element', () => {
      expect(sumArray([5])).toBe(5);
    });

    test('should handle large array (1000 elements)', () => {
      const large = Array(1000).fill(1);
      expect(sumArray(large)).toBe(1000);
    });
  });

  // 3. 요소 타입 오류
  describe('배열 요소', () => {
    test('should handle negative numbers', () => {
      expect(sumArray([-1, -2, -3])).toBe(-6);
    });

    test('should handle floating point', () => {
      expect(sumArray([1.5, 2.5, 3.5])).toBe(7.5);
    });

    test('should handle zero', () => {
      expect(sumArray([0, 0, 0])).toBe(0);
    });

    test('should throw for non-numeric element', () => {
      expect(() => sumArray([1, 'two', 3])).toThrow();
    });

    test('should throw for NaN in array', () => {
      expect(() => sumArray([1, NaN, 3])).toThrow();
    });

    test('should throw for Infinity', () => {
      expect(() => sumArray([1, Infinity, 3])).toThrow();
    });
  });

  // 4. 무한/특수값
  describe('특수값', () => {
    test('should handle very small numbers', () => {
      expect(sumArray([0.0001, 0.0002])).toBeCloseTo(0.0003);
    });

    test('should handle very large numbers', () => {
      expect(sumArray([1e10, 2e10])).toBe(3e10);
    });
  });
});
```

---

## 언어별 경계/예외 테스트 예제

### JavaScript/Jest

```javascript
// 문자열 처리 함수
function truncate(str, maxLength) {
  if (typeof str !== 'string') throw new TypeError('str must be string');
  if (maxLength < 1) throw new Error('maxLength must be >= 1');
  return str.substring(0, maxLength);
}

describe('truncate', () => {
  // 경계값 테스트
  test('should handle minLength = 1', () => {
    expect(truncate('hello', 1)).toBe('h');
  });

  test('should handle exact length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  test('should handle larger than length', () => {
    expect(truncate('hello', 100)).toBe('hello');
  });

  // 예외 테스트
  test('should throw for maxLength = 0', () => {
    expect(() => truncate('hello', 0)).toThrow('maxLength must be >= 1');
  });

  test('should throw for negative maxLength', () => {
    expect(() => truncate('hello', -1)).toThrow();
  });

  test('should throw for null input', () => {
    expect(() => truncate(null, 5)).toThrow(TypeError);
  });

  test('should throw for undefined input', () => {
    expect(() => truncate(undefined, 5)).toThrow(TypeError);
  });

  // 엣지 케이스
  test('should handle empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  test('should handle special characters', () => {
    expect(truncate('안녕하세요', 2)).toBe('안녕');
  });
});
```

### Python/pytest

```python
import pytest

def divide(a, b):
    """나누기 연산"""
    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        raise TypeError("operands must be numeric")
    if b == 0:
        raise ValueError("division by zero")
    return a / b

class TestDivide:
    """경계값 및 예외 상황 테스트"""

    # 경계값 테스트
    def test_boundary_positive_numbers(self):
        assert divide(10, 2) == 5
        assert divide(1, 1) == 1
        assert divide(100, 1) == 100

    def test_boundary_negative_numbers(self):
        assert divide(-10, 2) == -5
        assert divide(10, -2) == -5
        assert divide(-10, -2) == 5

    def test_boundary_floating_point(self):
        assert abs(divide(1, 3) - 0.3333) < 0.001
        assert divide(0.5, 0.5) == 1

    def test_boundary_very_small_numbers(self):
        result = divide(0.0001, 0.0001)
        assert result == 1

    def test_boundary_very_large_numbers(self):
        result = divide(1e10, 1e5)
        assert result == 1e5

    # 예외 상황 테스트
    def test_exception_zero_divisor(self):
        with pytest.raises(ValueError, match="division by zero"):
            divide(10, 0)

    def test_exception_invalid_type_a(self):
        with pytest.raises(TypeError, match="operands must be numeric"):
            divide("10", 2)

    def test_exception_invalid_type_b(self):
        with pytest.raises(TypeError):
            divide(10, "2")

    def test_exception_none_input(self):
        with pytest.raises(TypeError):
            divide(None, 2)

    def test_exception_infinity(self):
        # float('inf')는 유효한 입력으로 취급
        result = divide(float('inf'), 2)
        assert result == float('inf')

    # 엣지 케이스
    def test_edge_zero_numerator(self):
        assert divide(0, 5) == 0

    def test_edge_one_divisor(self):
        assert divide(42, 1) == 42
```

---

## 테스트 작성 체크리스트

### 경계값 테스트

- [ ] 각 입력 파라미터의 유효 범위 명시
- [ ] 최소값 테스트 (`min`)
- [ ] 최소값 직전 테스트 (`min - 1`)
- [ ] 최소값 직후 테스트 (`min + 1`)
- [ ] 최대값 테스트 (`max`)
- [ ] 최대값 직전 테스트 (`max - 1`)
- [ ] 최대값 직후 테스트 (`max + 1`)
- [ ] 중간값 테스트 (선택)
- [ ] 길이 0 (빈 컬렉션)
- [ ] 길이 1 (최소 비어있지 않음)
- [ ] 특수값 (0, -0, '', null, undefined, NaN, Infinity)

### 예외 상황 테스트

- [ ] null/undefined 입력
- [ ] 잘못된 타입 입력
- [ ] 유효 범위 벗어난 값
- [ ] 필수 파라미터 누락
- [ ] 비어있는 컬렉션
- [ ] 매우 큰 컬렉션
- [ ] 특수 숫자값 (Infinity, NaN, -0)
- [ ] 의존성/리소스 오류 (DB, API, 파일)
- [ ] 상태 오류 (초기화 전 사용, 이미 닫힘)
- [ ] 동시성 오류 (멀티스레드/비동기)

### 복합 경계값 테스트

여러 파라미터가 있을 때:

```javascript
describe('복합 경계값 테스트', () => {
  // (age 경계 + name 경계) 조합
  test('should handle boundary on age and boundary on name', () => {
    // min age, min name length
    expect(isValidAge(1, 'a')).toBe(true);
    
    // min age, max name length
    expect(isValidAge(1, 'A'.repeat(50))).toBe(true);
    
    // max age, min name length
    expect(isValidAge(150, 'a')).toBe(true);
    
    // max age, max name length
    expect(isValidAge(150, 'A'.repeat(50))).toBe(true);
  });
});
```

---

## 흔한 놓침과 해결책

| 놓친 부분 | 원인 | 해결책 |
|---------|------|--------|
| 경계값 누락 | 시간 부족 | 체크리스트 사용, 자동화 도구 |
| 0과 음수 미테스트 | 부주의 | 명시적으로 포함 |
| null/undefined 미테스트 | JavaScript 타입 무시 | 동적 언어는 필수 테스트 |
| 예외 메시지 검증 안 함 | 오류 메시지만 확인 | `toThrow('message')` 사용 |
| 실수 연산 오류 | 부동소수점 비교 | `toBeCloseTo()` 사용 |
| 복합 조건 누락 | 단순 케이스만 테스트 | 매트릭스 작성 (경계 조합) |

---

## 추가 리소스

### 경계값 분석 (Boundary Value Analysis)
- 유효 범위 기반 테스트 설계
- 3값 또는 5값 테스트

### 동등 분할 (Equivalence Partitioning)
```
유효: 1 ~ 150
무효 (작음): <= 0
무효 (큼): >= 151

각 분할에서 하나 이상 테스트
```

### 결정 테이블 테스트 (Decision Table Testing)
```
| age | name | result |
|-----|------|--------|
| 1   | 'a'  | ✓      |
| 1   | ''   | ✗      |
| 0   | 'a'  | ✗      |
| 151 | 'a'  | ✗      |
```

---

## 다음 단계

1. 기존 테스트 검토 → 경계값/예외 누락 찾기
2. 체크리스트 사용 → 새 테스트에 경계/예외 추가
3. 자동화 → 커버리지 도구로 누락된 케이스 찾기
4. 문서화 → 테스트 범위와 의도 명시
