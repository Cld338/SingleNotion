---
name: one-assertion-concept
description: "Use when: writing or refactoring test cases, ensuring each test verifies only one concept. Applies the 'one assertion per concept' principle for clear, maintainable, and purpose-driven tests."
---

# One Assertion per Test Concept 스킬

## 핵심 원칙

**각 테스트는 정확히 하나의 개념(concept)만 검증해야 합니다.**

### "One Assertion"이 아니라 "One Concept"인 이유

흔한 오해:
- ❌ "어설션은 정확히 1개여야 한다"
- ✅ "테스트는 하나의 개념만 검증해야 한다"

**차이점:**
```javascript
// ❌ 개념적으로는 여러 것을 검증
test('user creation', () => {
  const user = createUser({ name: 'John', age: 30, email: 'john@example.com' });
  expect(user.name).toBe('John');
  expect(user.age).toBe(30);
  expect(user.email).toBe('john@example.com');
  // 어설션 3개지만, 모두 "createUser 성공" 이라는 한 개념
});

// ✅ 하나의 개념, 여러 어설션이 필요하면 OK
test('user object should contain all provided fields', () => {
  const user = createUser({ name: 'John', age: 30, email: 'john@example.com' });
  
  expect(user).toMatchObject({
    name: 'John',
    age: 30,
    email: 'john@example.com'
  });
});

// ✅ 또는 개별 개념으로 분리
test('should set user name correctly', () => {
  const user = createUser({ name: 'John', age: 30 });
  expect(user.name).toBe('John');
});

test('should set user age correctly', () => {
  const user = createUser({ name: 'John', age: 30 });
  expect(user.age).toBe(30);
});
```

---

## 개념이란?

**테스트 개념** = 테스트가 검증하는 단일한 목표/행동/결과

### 개념의 예시

```javascript
// 개념 1: 유효한 입력 처리
test('should accept valid email', () => {
  expect(isValidEmail('john@example.com')).toBe(true);
});

// 개념 2: 무효한 형식 거부
test('should reject email without @', () => {
  expect(isValidEmail('johnexample.com')).toBe(false);
});

// 개념 3: 빈 입력 거부
test('should reject empty email', () => {
  expect(isValidEmail('')).toBe(false);
});

// 개념 4: 복잡한 유효 형식 수용
test('should accept email with dots and hyphens', () => {
  expect(isValidEmail('john.doe-smith@example.co.uk')).toBe(true);
});
```

각 테스트는:
- ✅ **하나의 시나리오** (예: 이 입력을 받았을 때)
- ✅ **하나의 결과** 검증 (예: 이렇게 동작해야 한다)

---

## "개념 분리" vs "개념 통합"

### 시나리오 1: User 클래스

```javascript
// ❌ 나쁜 예: 여러 개념을 한 테스트에 섞임
test('User class should work', () => {
  const user = new User('John', 30);
  
  expect(user.getName()).toBe('John');  // 개념: 이름 저장
  expect(user.getAge()).toBe(30);       // 개념: 나이 저장
  expect(user.isAdult()).toBe(true);    // 개념: 성인 판별
  expect(user.getage()).toBe(30);       // 오타에 감지 안 됨!
});

// ✅ 좋은 예: 각 개념마다 테스트
describe('User class', () => {
  describe('name management', () => {
    test('should store and retrieve name', () => {
      const user = new User('John', 30);
      expect(user.getName()).toBe('John');
    });

    test('should handle empty name', () => {
      const user = new User('', 30);
      expect(user.getName()).toBe('');
    });
  });

  describe('age management', () => {
    test('should store and retrieve age', () => {
      const user = new User('John', 30);
      expect(user.getAge()).toBe(30);
    });

    test('should correctly identify adults', () => {
      const adult = new User('John', 30);
      expect(adult.isAdult()).toBe(true);
    });

    test('should correctly identify minors', () => {
      const minor = new User('Jane', 15);
      expect(minor.isAdult()).toBe(false);
    });
  });
});
```

**차이점:**
| 나쁜 예 | 좋은 예 |
|--------|--------|
| 테스트 1개 | 테스트 5개 |
| 한 곳 실패 → 전체 불명확 | 한 곳 실패 → 명확한 원인 |
| 30살의 성인 판별 여부 호출 안 됨 | 모든 개념이 검증됨 |

---

### 시나리오 2: 배열 정렬

```javascript
// ❌ 나쁜 예: 모든 케이스를 한 테스트에
test('sort should work', () => {
  expect(sort([3, 1, 2])).toEqual([1, 2, 3]);        // 일반 케이스
  expect(sort([])).toEqual([]);                       // 빈 배열
  expect(sort([1])).toEqual([1]);                     // 1개 요소
  expect(sort([3, 3, 1])).toEqual([1, 3, 3]);       // 중복
  expect(sort([-1, 0, 1])).toEqual([-1, 0, 1]);     // 음수
  expect(sort([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]); // 역순
});

// ✅ 좋은 예: 각 개념별 테스트
describe('sort function', () => {
  describe('기본 정렬', () => {
    test('should sort three numbers in ascending order', () => {
      expect(sort([3, 1, 2])).toEqual([1, 2, 3]);
    });
  });

  describe('엣지 케이스', () => {
    test('should handle empty array', () => {
      expect(sort([])).toEqual([]);
    });

    test('should handle single element', () => {
      expect(sort([1])).toEqual([1]);
    });
  });

  describe('특수 케이스', () => {
    test('should preserve duplicate values', () => {
      expect(sort([3, 3, 1])).toEqual([1, 3, 3]);
    });

    test('should handle negative numbers', () => {
      expect(sort([-1, 0, 1])).toEqual([-1, 0, 1]);
    });

    test('should handle fully reversed array', () => {
      expect(sort([5, 4, 3, 2, 1])).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
```

**큰 장점:**
- ✅ 각 테스트가 빠름
- ✅ 실패 시 **정확히 어느 케이스**가 문제인지 알 수 있음
- ✅ 테스트 이름으로 **개념 이해** 가능
- ✅ 유지보수 쉬움

---

## 개념을 판단하는 질문

테스트가 여러 개념을 섞고 있진 않나 확인하려면 이 질문을 던져보세요:

1. **"이 테스트가 왜 실패했는가?"**
   - 답이 명확한가? → 한 개념 ✅
   - 여러 가능성이 있는가? → 여러 개념 ❌

2. **"이 테스트의 목적이 뭔가?"**
   - 한 문장으로 설명 가능한가? → 한 개념 ✅
   - 복잡한가? → 여러 개념 ❌

3. **"테스트 이름이 이 목적을 반영하는가?"**
   - 테스트 이름 = 테스트 목적인가? → 한 개념 ✅
   - 이름만으로는 무엇을 하는지 애매한가? → 여러 개념 ❌

---

## 실전 리팩토링 패턴

### 패턴 1: 단일 개념 확인 (Single Responsibility)

```javascript
// ❌ Before: 여러 개념
test('validateForm should work', () => {
  expect(validateForm({ name: '', email: 'invalid', age: -5 })).toBe(false);
});

// ✅ After: 각 필드별 개념
test('validateForm should return false when name is empty', () => {
  expect(validateForm({ name: '', email: 'valid@test.com', age: 25 })).toBe(false);
});

test('validateForm should return false when email is invalid', () => {
  expect(validateForm({ name: 'John', email: 'invalid', age: 25 })).toBe(false);
});

test('validateForm should return false when age is negative', () => {
  expect(validateForm({ name: 'John', email: 'valid@test.com', age: -5 })).toBe(false);
});

test('validateForm should return true when all fields are valid', () => {
  expect(validateForm({ name: 'John', email: 'valid@test.com', age: 25 })).toBe(true);
});
```

### 패턴 2: 상황별 개념 분리

```javascript
// ❌ Before: 여러 상황을 한 테스트에
test('calculateTotal should apply discounts', () => {
  expect(calculateTotal([10, 20], 0.1)).toBe(27);  // 정상
  expect(calculateTotal([], 0.1)).toBe(0);         // 빈 배열
  expect(calculateTotal([10], 0)).toBe(10);        // 할인 없음
});

// ✅ After: 각 상황별 개념
test('calculateTotal should apply discount correctly to purchase total', () => {
  expect(calculateTotal([10, 20], 0.1)).toBe(27);  // (10+20) * 0.9
});

test('calculateTotal should return 0 for empty item list', () => {
  expect(calculateTotal([], 0.1)).toBe(0);
});

test('calculateTotal should return raw total when discount rate is 0', () => {
  expect(calculateTotal([10], 0)).toBe(10);
});
```

### 패턴 3: JQuery/DOM 테스트

```javascript
// ❌ Before: 여러 DOM 변경을 검증
test('toggleButton should work', () => {
  const button = $('#toggle-btn');
  button.click();
  
  expect(button.hasClass('active')).toBe(true);
  expect($('#content').is(':visible')).toBe(true);
  expect($('#status').text()).toBe('Visible');
});

// ✅ After: 각 효과별 개념
test('toggleButton should add active class to button when clicked', () => {
  const button = $('#toggle-btn');
  button.click();
  expect(button.hasClass('active')).toBe(true);
});

test('toggleButton should show content when clicked', () => {
  const button = $('#toggle-btn');
  button.click();
  expect($('#content').is(':visible')).toBe(true);
});

test('toggleButton should update status text when clicked', () => {
  const button = $('#toggle-btn');
  button.click();
  expect($('#status').text()).toBe('Visible');
});
```

---

## 여러 어설션이 "같은 개념"인 경우 (OK)

### 케이스 1: 객체 속성

```javascript
// ✅ OK: 모두 같은 개념 (user 객체 생성)
test('should create user with all properties', () => {
  const user = createUser('John', 30, 'john@example.com');
  
  expect(user.name).toBe('John');
  expect(user.age).toBe(30);
  expect(user.email).toBe('john@example.com');
});

// 또는 더 깔끔한 방식
test('should create user with all properties', () => {
  const user = createUser('John', 30, 'john@example.com');
  
  expect(user).toMatchObject({
    name: 'John',
    age: 30,
    email: 'john@example.com'
  });
});
```

### 케이스 2: 배열 요소

```javascript
// ✅ OK: 모두 같은 개념 (배열 매핑)
test('should double all array elements', () => {
  const result = double([1, 2, 3]);
  
  expect(result[0]).toBe(2);
  expect(result[1]).toBe(4);
  expect(result[2]).toBe(6);
});

// 또는 더 깔끔한 방식
test('should double all array elements', () => {
  const result = double([1, 2, 3]);
  expect(result).toEqual([2, 4, 6]);
});
```

### 케이스 3: 전후 상태

```javascript
// ✅ OK: 같은 개념 (이전 상태 → 이후 상태)
test('should transition user from pending to active', () => {
  const user = new User('John');
  
  expect(user.status).toBe('pending');  // 초기 상태
  user.activate();
  expect(user.status).toBe('active');   // 변경 후
  expect(user.isActive()).toBe(true);   // 상태 확인
});
```

---

## 테스트 이름 작성 가이드

### 개념이 명확한 이름

```javascript
// ✅ 명확함
test('should reject email without @', () => { });
test('should accept email with valid format', () => { });
test('should handle empty array', () => { });

// ❌ 불명확함
test('validation works', () => { });
test('should validate', () => { });
test('test user creation', () => { });
```

### 이름 작성 규칙

```
should [행동] [조건 또는 입력]
should [행동] when [상황]
should not [행동] when [조건]
should throw [에러] when [상황]
```

**예시:**
```javascript
test('should throw TypeError when name is not a string', () => {});
test('should return discount price when rate is applied', () => {});
test('should handle array with negative numbers', () => {});
test('should not process request when user is not authenticated', () => {});
```

---

## 언어별 실전 예제

### JavaScript/Jest

```javascript
describe('calculateAge', () => {
  const birthYear = 1990;

  // ✅ 개념 1: 나이 계산
  test('should calculate correct age', () => {
    const currentYear = 2024;
    expect(calculateAge(birthYear, currentYear)).toBe(34);
  });

  // ✅ 개념 2: 태어나지 않은 경우
  test('should return negative for future birth year', () => {
    const currentYear = 2024;
    expect(calculateAge(2030, currentYear)).toBe(-6);
  });

  // ✅ 개념 3: 경계값
  test('should return 0 for current year birth', () => {
    expect(calculateAge(2024, 2024)).toBe(0);
  });

  // ✅ 개념 4: 만 나이 완성일
  test('should calculate age as 1 year old when born last year', () => {
    expect(calculateAge(2023, 2024)).toBe(1);
  });
});
```

### Python/pytest

```python
class TestUserAuthentication:
    
    # ✅ 개념 1: 유효한 인증
    def test_should_authenticate_valid_user(self):
        user = authenticate('john', 'password123')
        assert user is not None
        assert user.username == 'john'
    
    # ✅ 개념 2: 잘못된 비밀번호
    def test_should_reject_invalid_password(self):
        with pytest.raises(AuthenticationError, match='Invalid password'):
            authenticate('john', 'wrongpassword')
    
    # ✅ 개념 3: 존재하지 않는 사용자
    def test_should_reject_nonexistent_user(self):
        with pytest.raises(UserNotFoundError):
            authenticate('nonexistent', 'password123')
    
    # ✅ 개념 4: 빈 자격증명
    def test_should_reject_empty_credentials(self):
        with pytest.raises(ValidationError, match='Credentials required'):
            authenticate('', '')
```

---

## 일반적인 실수와 해결책

| 실수 | 원인 | 해결책 |
|------|------|--------|
| 여러 어설션이 섞임 | 테스트 작성이 빠름 | 이름으로 개념 정의 후 작성 |
| 테스트 실패 시 원인 불명확 | 여러 개념 섞임 | 개념 분리 |
| 테스트 수가 너무 많음 | 과도하게 분리 | 같은 개념은 유지 |
| 테스트 유지보수 어려움 | 개념이 불명확 | 이름 개선 및 리팩토링 |
| 코드 커버리지 낮음 | 중요 개념 누락 | 주요 시나리오 검증 |

---

## 단계별 리팩토링 프로세스

### Step 1: 기존 테스트 검토

```javascript
// 현재 테스트
test('processOrder should work', () => {
  const order = new Order([item1, item2]);
  expect(order.total).toBe(30);
  expect(order.itemCount).toBe(2);
  expect(order.status).toBe('pending');
  expect(order.createdAt).toBeDefined();
  expect(order.items).toHaveLength(2);
});
```

### Step 2: 개념 식별

- 개념 1: 총액 계산
- 개념 2: 아이템 개수
- 개념 3: 초기 상태
- 개념 4: 생성 타임스탐프
- 개념 5: 아이템 저장

### Step 3: 테스트 분리

```javascript
describe('Order class', () => {
  const order = new Order([item1, item2]);

  // 개념 1
  test('should calculate total price correctly', () => {
    expect(order.total).toBe(30);
  });

  // 개념 2
  test('should track item count', () => {
    expect(order.itemCount).toBe(2);
  });

  // 개념 3
  test('should initialize order as pending', () => {
    expect(order.status).toBe('pending');
  });

  // 개념 4
  test('should set creation timestamp', () => {
    expect(order.createdAt).toBeDefined();
  });

  // 개념 5 (이미 포함, 불필요할 수 있음)
  test('should store all items', () => {
    expect(order.items).toHaveLength(2);
    expect(order.items).toContain(item1);
    expect(order.items).toContain(item2);
  });
});
```

---

## 느낄 수 있는 개선 효과

분리 전후 비교:

```javascript
// 테스트 1개 실패
❌ processOrder should work (1 assertion failed)
→ 어디가 문제인가? 불명확!

// 테스트 5개 중 1개 실패
❌ should calculate total price correctly
→ 명확: 총액 계산 로직 문제!
```

---

## 다음 단계

1. **기존 테스트 검토** → 여러 개념이 섞인 테스트 찾기
2. **테스트 네임 개선** → "should..."로 시작하는 동작 명시
3. **의존 테스트 분리** → 각 개념별 독립 테스트 작성
4. **Code Review** → "이 테스트는 몇 개 개념을 검증하나?" 질문
5. **팀 표준화** → 통일된 스타일 가이드 정의
