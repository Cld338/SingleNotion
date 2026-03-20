---
file_name: BOUNDARY-EXCEPTION-CHECKLIST.md
description: 경계값 및 예외 상황 테스트용 실행 체크리스트
---

# 경계값 & 예외 상황 테스트 - 실행 체크리스트

## 테스트 계획 (Pre-Testing)

### 입력 분석
- [ ] 모든 입력 파라미터 나열
- [ ] 각 파라미터의 유효 범위 정의
- [ ] 파라미터 타입 명시
- [ ] 필수/선택 파라미터 구분

**예:**
```
함수: calculateDiscount(price, rate)
- price: 숫자, 0 < price < 1,000,000
- rate: 숫자, 0 ≤ rate ≤ 1
```

### 경계값 식별
- [ ] 각 범위의 최소값 확인
- [ ] 각 범위의 최대값 확인
- [ ] 범위 직전/직후 값 식별
- [ ] 특수값 (0, -0, 음수, 매우 큰 값) 식별

**예:**
```
price 경계값: 0.01, 0, 0.01, 100, 999,999, 1,000,000, 1,000,001
rate 경계값: -0.01, 0, 0.01, 0.5, 0.99, 1, 1.01
```

### 예외 상황 식별
- [ ] 입력 검증 실패 경우
- [ ] null/undefined 처리
- [ ] 타입 불일치
- [ ] 유효범위 초과
- [ ] 의존성 오류 (DB, API)
- [ ] 상태 오류
- [ ] 동시성 문제

---

## 경계값 테스트 작성

### 규칙
- [ ] 각 경계값마다 개별 테스트 작성
- [ ] 테스트 네임: `should handle [경계 설명]`
- [ ] 각 테스트는 한 가지만 검증
- [ ] 너무 많은 경계값은 필터링 (중요한 것 우선)

### 체크리스트 템플릿

```javascript
describe('functionName - 경계값 테스트', () => {
  describe('파라미터1 범위 (min ~ max)', () => {
    test('should handle value below minimum', () => {
      // Test: min - ε
    });

    test('should handle minimum value', () => {
      // Test: min
    });

    test('should handle just above minimum', () => {
      // Test: min + 1/ε
    });

    test('should handle middle value', () => {
      // Test: (min + max) / 2
    });

    test('should handle just below maximum', () => {
      // Test: max - 1/ε
    });

    test('should handle maximum value', () => {
      // Test: max
    });

    test('should handle value above maximum', () => {
      // Test: max + ε
    });
  });
});
```

### 특수값 테스트

**숫자:**
- [ ] 0 (값이 중요하면)
- [ ] -0 (부호 중요시)
- [ ] 음수 (음수 허용 여부)
- [ ] 매우 작은 값 (1e-10)
- [ ] 매우 큰 값 (1e10)
- [ ] Infinity (나누기 0 등)
- [ ] -Infinity
- [ ] NaN (결과 불확정 시)

**문자열:**
- [ ] 빈 문자열 ''
- [ ] 1글자
- [ ] max 글자
- [ ] max + 1글자
- [ ] 특수문자 (!@#$)
- [ ] 이모지 😀
- [ ] 줄 바꿈 \n
- [ ] 탭 \t
- [ ] null (언어별 다름)

**컬렉션:**
- [ ] 빈 배열 []
- [ ] 1개 요소
- [ ] 정상 크기
- [ ] 매우 큰 배열 (1000+)
- [ ] 중첩 구조

---

## 예외 상황 테스트 작성

### 1. 입력 검증 (Type & Null Check)

```javascript
describe('functionName - 입력 검증', () => {
  test('should throw TypeError for null input', () => {
    expect(() => func(null)).toThrow(TypeError);
  });

  test('should throw TypeError for undefined input', () => {
    expect(() => func(undefined)).toThrow(TypeError);
  });

  test('should throw TypeError for wrong type', () => {
    expect(() => func('string')).toThrow(TypeError);
  });

  test('should throw for non-object input', () => {
    expect(() => func(123)).toThrow();
  });
});
```

**체크리스트:**
- [ ] null 테스트
- [ ] undefined 테스트
- [ ] 잘못된 타입 테스트 (string → number 등)
- [ ] 빈 객체 테스트
- [ ] 프리미티브 타입 테스트

### 2. 범위/제약 검증 (Constraint Check)

```javascript
describe('functionName - 범위 검증', () => {
  test('should throw Error for value below minimum', () => {
    expect(() => func(MIN - 1)).toThrow('must be >= MIN');
  });

  test('should throw Error for value above maximum', () => {
    expect(() => func(MAX + 1)).toThrow('must be <= MAX');
  });

  test('should accept minimum value', () => {
    expect(func(MIN)).toBeDefined();
  });

  test('should accept maximum value', () => {
    expect(func(MAX)).toBeDefined();
  });
});
```

**체크리스트:**
- [ ] 최소값 미만 → 에러
- [ ] 최대값 초과 → 에러
- [ ] 최소값 정확히 → 성공
- [ ] 최대값 정확히 → 성공
- [ ] 빈 문자열 → 검증 (필요시 에러)
- [ ] 빈 배열 → 검증

### 3. 리소스/의존성 오류 (Dependency Error)

```javascript
describe('functionName - 의존성 오류', () => {
  test('should throw when database connection fails', () => {
    // Mock DB failure
    databaseMock.connect.mockRejectedValue(new Error('Connection failed'));
    
    expect(() => func()).rejects.toThrow('Connection failed');
  });

  test('should throw when API request fails', () => {
    // Mock API failure
    apiMock.fetch.mockRejectedValue(new Error('Timeout'));
    
    expect(() => func()).rejects.toThrow('Timeout');
  });
});
```

**체크리스트:**
- [ ] DB 연결 실패
- [ ] API 호출 실패
- [ ] 파일 읽기 실패
- [ ] 네트워크 타임아웃
- [ ] 권한 오류

### 4. 상태 오류 (State Error)

```javascript
describe('functionName - 상태 오류', () => {
  test('should throw when calling before initialization', () => {
    const obj = new MyClass();
    
    expect(() => obj.process()).toThrow('Not initialized');
  });

  test('should throw when resource is already closed', () => {
    const resource = new Resource();
    resource.close();
    
    expect(() => resource.read()).toThrow('Resource is closed');
  });
});
```

**체크리스트:**
- [ ] 초기화 전 사용
- [ ] 종료 후 사용
- [ ] 중복 초기화
- [ ] 중복 종료

---

## 통합 테스트 시나리오

### 조합 경계값 (Combinatorial)

여러 파라미터의 경계값 조합:

```javascript
describe('function with multiple params', () => {
  const testCases = [
    // (param1, param2, expected)
    (1, 1, true),         // 둘 다 최소
    (1, MAX, true),       // 최소, 최대
    (MAX, 1, true),       // 최대, 최소
    (MAX, MAX, true),     // 둘 다 최대
    (0, 1, false),        // param1 범위 초과
    (1, MAX + 1, false),  // param2 범위 초과
  ];

  testCases.forEach(([p1, p2, expected]) => {
    test(`should handle (${p1}, ${p2})`, () => {
      expect(func(p1, p2)).toBe(expected);
    });
  });
});
```

---

## 성능 및 스트레스 테스트

### 큰 입력값

```javascript
describe('functionName - 성능', () => {
  test('should handle very large array', () => {
    const largeArray = Array(10000).fill(1);
    const startTime = Date.now();
    const result = func(largeArray);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(1000);  // 1초 이내
    expect(result).toBeDefined();
  });

  test('should handle very long string', () => {
    const longString = 'a'.repeat(1000000);
    const result = func(longString);
    expect(result).toBeDefined();
  });

  test('should handle deeply nested object', () => {
    let obj = { value: 1 };
    for (let i = 0; i < 100; i++) {
      obj = { nested: obj };
    }
    
    expect(() => func(obj)).not.toThrow();
  });
});
```

---

## 검토 체크리스트 (Code Review)

### 경계값 검토

- [ ] 최소/최대 경계값 테스트 있는가?
- [ ] 범위 직전/직후 테스트 있는가?
- [ ] 특수값 (0, 음수, Infinity 등) 테스트 있는가?
- [ ] 길이 0 테스트 있는가?
- [ ] 테스트 이름이 명확한가?
- [ ] 각 테스트가 한 가지만 검증하는가?

### 예외 검증

- [ ] null/undefined 테스트 있는가?
- [ ] 타입 검증 테스트 있는가?
- [ ] 범위 검증 테스트 있는가?
- [ ] 오류 메시지 검증하는가?
- [ ] 의존성 실패 시 처리 테스트 있는가?

### 커버리지 확인

```bash
# 커버리지 리포트
npm test -- --coverage

# 목표: Branches 커버리지 > 90%
# (모든 조건 경로를 커버해야 함)
```

---

## 일반적인 실수

| 실수 | 해결책 |
|------|--------|
| 경계값만 테스트, 예외 안 함 | 예외도 동시에 |
| 정상 케이스만 테스트 | 비정상 케이스 추가 |
| 오류 메시지 검증 안 함 | `toThrow('message')` 사용 |
| 너무 많은 경계값 | 80/20 원칙: 중요한 것만 |
| 실수 연산 오류 | `toBeCloseTo()` 사용 |
| 의존성 모킹 안 함 | jest.mock() 사용 |
| 상태 테스트 누락 | beforeEach/afterEach로 상태 관리 |

---

## 자동 생성 도구 활용

### 등가 분할 자동화
```javascript
// 도구로 자동 추출
const boundaries = findBoundaries(functionSignature);
// boundaries = [0, 1, MAX-1, MAX, MAX+1]
```

### 코드 커버리지 분석
```bash
npm test -- --coverage --collectCoverageFrom="src/**/*.js"
```

---

## 다음 단계

1. 함수 선택 → 경계값 식별
2. 체크리스트 작성 → 테스트 작성
3. 커버리지 확인 → 누락 테스트 추가
4. Code Review → 팀원 피드백
5. 리팩토링 → 테스트 유지보수
