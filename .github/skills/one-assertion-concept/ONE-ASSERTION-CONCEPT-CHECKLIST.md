---
file_name: ONE-ASSERTION-CONCEPT-CHECKLIST.md
description: 개념 검증 (One Assertion per Test Concept) 실행 체크리스트
---

# One Assertion per Test Concept - 실행 체크리스트

## 테스트 작성 전 (개념 설계)

### 1. 테스트의 목적 명확히

- [ ] "이 테스트는 무엇을 검증하는가?" 한 문장으로 답할 수 있는가?
- [ ] 답변이 명확하고 단순한가?
- [ ] 여러 개념이n 섞여 있지는 않은가?

**체크리스트:**
```
테스트 목적: 이 테스트는 [동작]이 [조건]에서 [결과]가 나오는지 검증한다
예: 이 테스트는 calcularTotal()이 할인율을 적용할 때 올바른 가격이 나오는지 검증한다
```

### 2. 필요한 어설션 목록화

- [ ] 이 개념을 검증하는 데 필요한 어설션 모두 나열
- [ ] 각 어설션이 같은 개념을 검증하는지 확인
- [ ] 관련 없는 어설션이 있는지 확인

**예:**
```
개념: "User 생성이 모든 필드를 정확히 저장한다"
필요 어설션:
- ✅ user.name이 입력값과 같다
- ✅ user.age가 입력값과 같다
- ✅ user.email이 입력값과 같다
(모두 같은 개념 → 한 테스트에 OK)

추가 어설션:
- ❌ user.status가 'active'이다 (다른 개념!)
- ❌ user.createdAt이 정의되었다 (다른 개념!)
→ 이것들은 별도 테스트로 분리
```

### 3. 테스트 이름 정의

- [ ] 테스트 이름 = 테스트가 검증하는 개념
- [ ] "should..."로 시작하는가?
- [ ] 이름이 명확하고 구체적인가?
- [ ] 읽는 사람이 이해할 수 있는가?

**패턴:**
```
should [동사][목적어] [조건/상황]
should [동사] [결과] when [상황]
should not [동사] [결과] when [상황]
should throw [에러] when [상황]

좋은 예:
- should calculate discount correctly when rate is provided
- should reject email when format is invalid
- should throw TypeError when input is not a string
- should handle empty array by returning zero

나쁜 예:
- should work
- test validation
- validate something
- should validate (뭔가?)
```

---

## 테스트 작성 중 (개념 검증)

### 1. Arrange-Act-Assert 분리 확인

```javascript
test('should calculate total with discount', () => {
  // ARRANGE: 테스트 데이터 준비
  const items = [10, 20, 30];
  const discountRate = 0.1;
  
  // ACT: 함수 실행
  const total = calculateTotal(items, discountRate);
  
  // ASSERT: 결과 검증 (한 개념)
  expect(total).toBe(54);  // (10+20+30)*0.9
});
```

- [ ] Arrange: 테스트 데이터 준비 (필요한 것만)
- [ ] Act: 함수/메서드 실행 (한 번만)
- [ ] Assert: 결과 검증 (한 개념)

### 2. 여러 어설션 판단

테스트에 여러 어설션이 있을 때:

```
질문 1: 모두 같은 입력값에서 나온 결과인가?
   - YES → 계속
   - NO → 테스트 분리!

질문 2: 모두 같은 개념을 검증하는가?
   - YES → OK (같은 어설션)
   - NO → 테스트 분리!

질문 3: 한 어설션이 실패하면 나머지가 실패하는 원인은 같은가?
   - YES → OK (같은 개념)
   - NO → 테스트 분리!
```

**체크리스트:**
- [ ] 어설션이 3개 이상인가? → 개념이 분리되지 않았을 가능성
- [ ] 어설션 간에 AND/OR 논리가 있는가? → 개념 분리 고려
- [ ] 한 어설션이 실패했을 때 원인이 명확한가? → OK

### 3. 객체 비교 (허용)

```javascript
// ✅ OK: 한 개념이지만 여러 어설션 필요
test('should create user with correct properties', () => {
  const user = createUser('John', 30, 'john@example.com');
  
  expect(user).toMatchObject({
    name: 'John',
    age: 30,
    email: 'john@example.com'
  });
});

// 또는 개별 어설션
test('should create user with correct properties', () => {
  const user = createUser('John', 30, 'john@example.com');
  
  expect(user.name).toBe('John');
  expect(user.age).toBe(30);
  expect(user.email).toBe('john@example.com');
});
```

- [ ] `toMatchObject()` 사용 고려 (깔끔함)
- [ ] 개별 어설션이 필요하면 이름으로 개념 명시

---

## 테스트 작성 후 (리뷰 & 리팩토링)

### 1. 테스트 이름 vs 내용 일치 확인

- [ ] 테스트 이름이 실제 검증 내용과 일치하는가?
- [ ] 이름만 보고도 무엇을 하는지 알 수 있는가?
- [ ] 이름이 너무 길지는 않은가? (한 문장 정도)

**Self-test:**
```
테스트 이름만 보고 (코드 없이):
1. 이 테스트가 무엇을 검증하는지 설명할 수 있는가?
2. 성공/실패 조건을 알 수 있는가?

"Yes" × 2 → 좋은 이름
```

### 2. 개념 분리 필요 여부 판단

기존 테스트 리뷰 때 사용:

```javascript
// 현재 테스트
test('order should work', () => {
  const order = createOrder([item1, item2]);
  expect(order.total).toBe(30);
  expect(order.status).toBe('pending');
  expect(order.items.length).toBe(2);
});
```

**판단 프로세스:**

| 항목 | 판단 | 결과 |
|------|------|------|
| 테스트 1개 실패 시 원인이 명확한가? | 여러 가능성 | ❌ 분리 필요 |
| 모든 어설션이 같은 입력으로 테스트되는가? | YES | ✅ |
| 모든 어설션이 같은 개념인가? | 아니오 (총액/상태/개수) | ❌ 분리 필요 |
| "should...when..." 형식으로 이름 지을 수 있나? | 어렵다 | ❌ 분리 필요 |

**결론:** 분리 필요! 

```javascript
// 리팩토링 후
test('should calculate order total by summing items', () => {
  const order = createOrder([item1, item2]);
  expect(order.total).toBe(30);
});

test('should initialize order with pending status', () => {
  const order = createOrder([item1, item2]);
  expect(order.status).toBe('pending');
});

test('should store all items in order', () => {
  const order = createOrder([item1, item2]);
  expect(order.items.length).toBe(2);
});
```

### 3. 의존 관계 확인

- [ ] 이 테스트가 이전 테스트 결과에 의존하는가? → 독립적으로 만들기
- [ ] 여러 테스트가 같은 setup을 사용하는가? → beforeEach 사용
- [ ] 테스트 순서가 중요한가? → 순서 의존 제거

---

## 리팩토링 패턴 (Before → After)

### 패턴 1: 조건별 분리

```javascript
// ❌ Before
test('isValidAge should work', () => {
  expect(isValidAge(25)).toBe(true);
  expect(isValidAge(0)).toBe(false);
  expect(isValidAge(-1)).toBe(false);
  expect(isValidAge(151)).toBe(false);
});

// ✅ After
test('should accept age between 1 and 150', () => {
  expect(isValidAge(25)).toBe(true);
});

test('should reject age 0', () => {
  expect(isValidAge(0)).toBe(false);
});

test('should reject negative age', () => {
  expect(isValidAge(-1)).toBe(false);
});

test('should reject age over 150', () => {
  expect(isValidAge(151)).toBe(false);
});
```

### 패턴 2: 단계별 분리

```javascript
// ❌ Before
test('processPayment should work', () => {
  const user = createUser('John');
  const card = addCard(user, '1234567890123456');
  const payment = processPayment(card, 100);
  
  expect(user.id).toBeDefined();
  expect(card.isValid).toBe(true);
  expect(payment.status).toBe('completed');
});

// ✅ After
describe('Payment Flow', () => {
  test('should create user with ID', () => {
    const user = createUser('John');
    expect(user.id).toBeDefined();
  });

  test('should validate added card', () => {
    const user = createUser('John');
    const card = addCard(user, '1234567890123456');
    expect(card.isValid).toBe(true);
  });

  test('should complete payment', () => {
    const user = createUser('John');
    const card = addCard(user, '1234567890123456');
    const payment = processPayment(card, 100);
    expect(payment.status).toBe('completed');
  });
});
```

### 패턴 3: 영역별 분리

```javascript
// ❌ Before
test('User class should work', () => {
  const user = new User('John', 30);
  expect(user.getName()).toBe('John');
  expect(user.getAge()).toBe(30);
  expect(user.isAdult()).toBe(true);
  expect(user.getFullProfile()).toContain('John');
});

// ✅ After
describe('User - Name', () => {
  test('should store and retrieve name', () => {
    const user = new User('John', 30);
    expect(user.getName()).toBe('John');
  });
});

describe('User - Age', () => {
  test('should store and retrieve age', () => {
    const user = new User('John', 30);
    expect(user.getAge()).toBe(30);
  });

  test('should identify adults', () => {
    const user = new User('John', 30);
    expect(user.isAdult()).toBe(true);
  });
});

describe('User - Profile', () => {
  test('should include name in profile', () => {
    const user = new User('John', 30);
    expect(user.getFullProfile()).toContain('John');
  });
});
```

---

## Code Review 체크리스트

다른 사람의 테스트를 검토할 때:

### 빠른 검토 (10초)

- [ ] 테스트 이름이 명확한가? "should..."로 시작하는가?
- [ ] 코드가 20줄 이상인가? (분리 신호)
- [ ] 어설션이 5개 이상인가? (분리 신호)

### 심화 검토 (1분)

- [ ] 테스트가 한 개념만 검증하는가?
- [ ] 한 어설션 실패 = 명확한 원인?
- [ ] 테스트 이름 = 실제 내용?
- [ ] 불필요한 어설션이 있는가?

### 제안 템플릿

```
좋은 코멘트:
"이 테스트는 name/age/email 세 가지를 동시에 검증하네요. 
 각각 별도 테스트로 분리하면 실패 원인이 더 명확할 것 같습니다."

나쁜 코멘트:
"이 테스트가 좋지 않습니다."
```

---

## 일반적인 예외 (허용되는 다중 어설션)

### 1. 상태 전이 (State Transition)

```javascript
// ✅ OK: 같은 개념 (상태 변화)
test('should transition from pending to active', () => {
  const order = new Order();
  
  expect(order.status).toBe('pending');  // 초기 상태
  order.activate();
  expect(order.status).toBe('active');   // 변경 후
  expect(order.activatedAt).toBeDefined(); // 타임스탐프
});
```

### 2. 객체 생성 (Object Creation)

```javascript
// ✅ OK: 같은 개념 (객체 모든 속성)
test('should create user with all fields', () => {
  const user = createUser('John', 30, 'john@test.com');
  
  expect(user).toMatchObject({
    name: 'John',
    age: 30,
    email: 'john@test.com'
  });
});
```

### 3. 컬렉션 검증 (Collection Verification)

```javascript
// ✅ OK: 같은 개념 (배열 내용)
test('should sort array correctly', () => {
  const result = sortArray([3, 1, 2]);
  
  expect(result).toEqual([1, 2, 3]);
  expect(result[0]).toBe(1);
  expect(result[2]).toBe(3);
});

// 또는 더 깔끔하게
test('should sort array correctly', () => {
  expect(sortArray([3, 1, 2])).toEqual([1, 2, 3]);
});
```

---

## 성능 체크

개념 분리의 이점 측정:

| 메트릭 | Before | After | 개선 |
|--------|--------|-------|------|
| 테스트 개수 | 1 | 5 | +400% |
| 평균 테스트 길이 | 15줄 | 5줄 | -67% |
| 실패 시 디버깅 시간 | 5분 | 30초 | 90% ↓ |
| 테스트 이해도 | 낮음 | 높음 | 명확 |

---

## 다음 단계

1. **현재 테스트 분석** → 여러 개념 섞인 테스트 목록화
2. **우선순위 지정** → 복잡한 것부터 리팩토링
3. **리팩토링 실행** → 한 개념씩 분리
4. **Code Review 적용** → 팀 표준으로 채택
5. **모니터링** → 신규 테스트에 원칙 적용 확인

---

## 팀 표준화 제안

### 팀 가이드라인

```markdown
# 우리 팀의 테스트 규칙

1. 각 테스트는 정확히 하나의 개념만 검증한다.
2. 테스트 이름은 "should..."로 시작하고 검증 개념을 명확히 한다.
3. 테스트 이름만으로 검증 내용을 이해할 수 있어야 한다.
4. 어설션은 최소 필요한 수만 작성한다. (대개 1-3개)
5. 같은 개념의 여러 어설션은 하나의 테스트에 묶는다. (예: 객체 속성)
```

### Review 질문

```
[ ] 이 테스트의 목적이 명확한가?
[ ] 테스트 이름이 내용을 반영하는가?
[ ] 한 개념만 검증하는가?
[ ] 실패 시 원인이 명확한가?
[ ] 불필요한 어설션이 있는가?
```
