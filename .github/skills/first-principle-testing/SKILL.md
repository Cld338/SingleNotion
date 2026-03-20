---
name: first-principle-testing
description: "Use when: writing unit tests, creating test suites, or reviewing test code. Ensures test cases follow FIRST principles (Fast, Independent, Repeatable, Self-verifying, Timely) for maintainable, reliable test coverage."
---

# FIRST Principle Testing Skill

테스트 코드가 견고하고 유지보수하기 쉽도록 **FIRST 원칙**을 따르도록 안내합니다.

## FIRST 원칙이란?

FIRST는 효과적인 단위 테스트의 5가지 핵심 특성입니다:

| 원칙 | 설명 | 체크리스트 |
|------|------|-----------|
| **Fast (빠른)** | 테스트는 빨리 실행되어야 함 | ✓ 외부 API 호출 없음 ✓ 데이터베이스 접근 없음 ✓ 네트워크 작업 없음 ✓ 실행 시간 < 100ms |
| **Independent (독립적인)** | 테스트들이 서로 의존하지 않아야 함 | ✓ 공유 상태 없음 ✓ 테스트 순서 무관 ✓ 단독 실행 가능 ✓ 클린업 코드 완벽 |
| **Repeatable (반복 가능한)** | 같은 결과를 지속적으로 보장해야 함 | ✓ 항상 같은 결과 ✓ 타이밍 문제 없음 ✓ 환경 의존성 없음 ✓ 난수 제어됨 |
| **Self-verifying (자체 검증)** | 통과/실패가 명확해야 함 | ✓ 단일 어설션 포커스 ✓ 명확한 오류 메시지 ✓ 수동 검증 불필요 |
| **Timely (적시의)** | 기능 구현 전에/중에 작성해야 함 | ✓ TDD 선호 ✓ 리팩토링 후 바로 작성 ✓ 버그 발견 시 즉시 작성 |

---

## 단계별 테스트 작성 가이드

### 1단계: 테스트 기초 설계 (Independent & Repeatable)

**목표**: 테스트가 독립적이고 반복 가능하도록 설계

```javascript
// ❌ 나쁜 예: 외부 상태에 의존
let globalCounter = 0;
describe('Counter', () => {
  test('increments', () => {
    globalCounter++;
    expect(globalCounter).toBe(1);
  });
});

// ✅ 좋은 예: 각 테스트마다 독립적인 인스턴스
describe('Counter', () => {
  let counter;
  
  beforeEach(() => {
    counter = new Counter();  // 각 테스트마다 새로 생성
  });
  
  afterEach(() => {
    counter = null;  // 클린업
  });
  
  test('increments', () => {
    expect(counter.increment()).toBe(1);
  });
});
```

**체크리스트**:
- [ ] `beforeEach`/`afterEach`로 테스트 격리 설정
- [ ] 공유 변수 제거
- [ ] 테스트 순서가 결과에 영향을 주지 않음
- [ ] 외부 의존성 모킹/스텁 준비

---

### 2단계: 테스트 구현 (Self-verifying)

**목표**: 명확한 어설션으로 자체 검증 가능하게 작성

```javascript
// ❌ 나쁜 예: 모호한 검증
test('user data', () => {
  const result = fetchUser(123);
  expect(result).toBeDefined();  // 뭐가 정확히 검증되는가?
});

// ✅ 좋은 예: 명확한 검증
test('fetchUser returns correct user data', () => {
  const result = fetchUser(123);
  
  expect(result).toBeDefined();
  expect(result.id).toBe(123);
  expect(result.name).toBe('John Doe');
  expect(result.email).toMatch(/^[\w.-]+@[\w.-]+\.\w+$/);
});

// ✅ 더 나은 예: BDD 스타일 (명확한 의도)
test('should return user with correct id and name', () => {
  expect(fetchUser(123)).toMatchObject({
    id: 123,
    name: 'John Doe'
  });
});
```

**체크리스트**:
- [ ] 테스트 이름이 "should..."로 시작 (의도 명확)
- [ ] 3-5개 이하의 어설션
- [ ] 각 어설션이 구체적이고 명확
- [ ] 오류 메시지 커스터마이징 검토

---

### 3단계: 속도 최적화 (Fast)

**목표**: 각 테스트가 100ms 이내에 완료

```javascript
// ❌ 나쁜 예: 외부 요청
test('fetches data', async () => {
  const data = await fetch('https://api.example.com/data');  // 느림!
  expect(data).toBeDefined();
});

// ✅ 좋은 예: 모킹 사용
test('fetches data', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue({
    json: async () => ({ id: 1, name: 'Test' })
  });
  
  const data = await fetch('https://api.example.com/data');
  expect(data).toBeDefined();
});

// ✅ 더 나은 예: 모듈 전체 모킹
jest.mock('../api');
api.fetchUser.mockResolvedValue({ id: 1, name: 'Test' });

test('fetches data', async () => {
  const data = await api.fetchUser(1);
  expect(data.id).toBe(1);
});
```

**체크리스트**:
- [ ] 외부 API/DB 호출 모킹
- [ ] 파일 시스템 접근 제거 또는 메모리 구현 사용
- [ ] `setTimeout` 제거 (대신 `jest.useFakeTimers()` 사용)
- [ ] 네트워크 작업 모킹
- [ ] 테스트 실행 시간 측정 (< 100ms)

```javascript
// 타이머 모킹 예제
jest.useFakeTimers();

test('delays callback', () => {
  const callback = jest.fn();
  delayedFunction(callback, 1000);
  
  jest.runAllTimers();  // 즉시 실행
  expect(callback).toHaveBeenCalled();
});

jest.useRealTimers();
```

---

### 4단계: 반복성/안정성 검증 (Repeatable)

**목표**: 테스트가 항상 같은 결과를 보장

```javascript
// ❌ 나쁜 예: 타이밍 의존
test('async operation', async () => {
  const promise = asyncFunction();
  await new Promise(r => setTimeout(r, 500));  // 타이밍 문제!
  expect(result).toBe(expected);
});

// ✅ 좋은 예: 명시적 대기
test('async operation', async () => {
  const result = await asyncFunction();  // 완료 대기
  expect(result).toBe(expected);
});

// ❌ 나쁜 예: 랜덤 데이터
test('generates id', () => {
  const id = generateRandomId();
  expect(id).toBeTruthy();  // 항상 다른 값!
});

// ✅ 좋은 예: 제어된 난수
test('generates id', () => {
  Math.random = jest.fn(() => 0.5);
  const id = generateIdWithRandom();
  expect(id).toBe('expected-id-format');
});
```

**체크리스트**:
- [ ] 현재 시간/날짜에 의존하지 않음
- [ ] 난수 제어됨 (모킹)
- [ ] 환경 변수 고정됨
- [ ] 테스트 5회 연속 실행 시 항상 통과

---

### 5단계: 적시 작성 (Timely)

**목표**: 기능 구현과 함께 테스트 작성

#### TDD 워크플로우 (추천)
```
1. 실패하는 테스트 작성 (Red)
2. 최소한의 코드로 통과 (Green)
3. 코드 정리/리팩토링 (Refactor)
```

```javascript
// Step 1: 테스트 먼저 작성
test('should calculate total discount correctly', () => {
  const discount = calculateDiscount(100, 0.1);
  expect(discount).toBe(10);  // 아직 함수 없음 - 실패
});

// Step 2: 코드 구현
function calculateDiscount(price, rate) {
  return price * rate;
}

// Step 3: 리팩토링 (필요시)
function calculateDiscount(price, rate) {
  if (price < 0 || rate < 0 || rate > 1) {
    throw new Error('Invalid input');
  }
  return Math.round(price * rate * 100) / 100;
}

// 리팩토링 후 테스트도 보충
test('should throw error for negative price', () => {
  expect(() => calculateDiscount(-100, 0.1)).toThrow();
});
```

**체크리스트**:
- [ ] 버그 발견 시 즉시 테스트 작성
- [ ] 기능 추가 전에 테스트 작성 (TDD)
- [ ] 리팩토링 후 테스트 보충
- [ ] 엣지 케이스를 위한 테스트 추가

---

## 테스트 코드 검토 체크리스트

새 테스트를 작성하거나 기존 테스트를 리뷰할 때 사용하세요:

### Fast (빠른) ✓
- [ ] 외부 API/네트워크 호출 없음
- [ ] 데이터베이스 접근 없음
- [ ] 파일 I/O 없음
- [ ] `setTimeout` 없음 (또는 `jest.useFakeTimers()` 사용)
- [ ] 예상 실행 시간 < 100ms

### Independent (독립적인) ✓
- [ ] `beforeEach`로 각 테스트마다 새로운 인스턴스 생성
- [ ] `afterEach`로 완벽한 클린업
- [ ] 테스트마다 격리된 상태 유지
- [ ] 다른 테스트 결과에 의존하지 않음
- [ ] 선택적으로 단독 실행 가능

### Repeatable (반복 가능한) ✓
- [ ] 현재 시간/날짜에 의존하지 않음
- [ ] 난수 제어됨 (모킹)
- [ ] 외부 상태에 의존하지 않음
- [ ] 연속 5회 실행 시 항상 통과

### Self-verifying (자체 검증) ✓
- [ ] 테스트 이름이 명확 (should...)
- [ ] 3-5개 이하의 어설션
- [ ] 각 어설션이 구체적
- [ ] 실패 시 명확한 오류 메시지
- [ ] 수동 검증 필요 없음

### Timely (적시의) ✓
- [ ] 기능 구현 전/중 작성됨
- [ ] 엣지 케이스 커버됨
- [ ] 버그 발견 후 즉시 테스트 추가됨

---

## 자주하는 실수와 해결책

| 문제 | 원인 | 해결책 |
|------|------|--------|
| 테스트가 느림 | 외부 요청 미모킹 | `jest.mock()` 또는 `jest.spyOn()` 사용 |
| 테스트 간헐적 실패 | 테스트 순서 의존 | `beforeEach`/`afterEach`로 격리 |
| 오류 메시지 불명확 | 일반적인 어설션 | 커스텀 메시지 추가: `expect(...).toBe(..., 'expected X but got Y')` |
| 테스트가 너무 많음 | 모든 케이스 테스트 | 중요한 케이스에 집중, 엣지만 추가 |
| 코드 커버리지 낮음 | 테스트 누락 | 주요 경로와 엣지 케이스 테스트 |

---

## 프レ임워크별 예제

### Jest (JavaScript)
```javascript
describe('UserService', () => {
  let userService;
  
  beforeEach(() => {
    userService = new UserService();
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should return user by ID', async () => {
    // Arrange
    const userId = 123;
    
    // Act
    const user = await userService.getUser(userId);
    
    // Assert
    expect(user.id).toBe(userId);
  });
});
```

### Python (pytest)
```python
import pytest
from user_service import UserService

@pytest.fixture
def user_service():
    """새 인스턴스 제공"""
    service = UserService()
    yield service
    service.cleanup()

def test_should_return_user_by_id(user_service):
    # Arrange
    user_id = 123
    
    # Act
    user = user_service.get_user(user_id)
    
    # Assert
    assert user.id == user_id
```

---

## 다음 단계

1. 기존 테스트르 FIRST 체크리스트로 검토
2. 불안정한 테스트 개선
3. TDD 워크플로우 도입
4. 팀 표준으로 문서화
