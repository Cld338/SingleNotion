---
name: test-teardown-cleanup
description: "Use when: writing or reviewing test cases, after testing is complete. Ensures proper state cleanup (teardown) to maintain test independence and prevent side effects between tests."
---

# Test Teardown & Cleanup 스킬

테스트 후 상태를 철저히 정리하여 **다음 테스트에 영향을 주지 않도록** 보장하는 스킬입니다.

---

## 핵심 개념

**Teardown** = 테스트 후 정리

```
테스트 실행 흐름:
Setup (beforeEach) → Test (실행) → Assert (검증) → Teardown (정리) ← 중요!
```

### 왜 필요한가?

```javascript
// ❌ Teardown 없음
test('should create user', () => {
  const user = createUser('John');
  expect(user.name).toBe('John');
  // 모킹, 타이머, 리스너, 파일 → 그대로 남음!
});

test('should update user', () => {
  // 이전 테스트의 mock이 여전히 활성 → 테스트 실패!
  const user = getUser();
});

// ✅ Teardown 있음
test('should create user', () => {
  const user = createUser('John');
  expect(user.name).toBe('John');
});
// afterEach에서 정리 → 다음 테스트는 깨끗한 상태 시작
```

---

## Teardown 레벨

### 레벨 1: 단일 테스트 정리 (afterEach)

**언제 사용**: 각 테스트마다 정리 필요

```javascript
describe('User Service', () => {
  afterEach(() => {
    // 각 테스트 후 실행
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test('should create user', () => {
    // 테스트
  });

  test('should delete user', () => {
    // 테스트
  });
  // 각 테스트 후에 afterEach 실행 ×2
});
```

### 레벨 2: 전체 테스트 정리 (afterAll)

**언제 사용**: 테스트 스위트 전체 후 정리 (DB, 파일, 서버 종료)

```javascript
describe('Database Integration', () => {
  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    // 모든 테스트 후 한 번만 실행
    await db.disconnect();
  });

  test('should save user', () => {
    // 테스트
  });

  test('should fetch user', () => {
    // 테스트
  });
  // afterAll 실행 ×1 (테스트 스위트 전체 후)
});
```

---

## 정리해야 할 항목 (Cleanup Targets)

### 1. Mock 정리

```javascript
afterEach(() => {
  jest.clearAllMocks();           // 모든 mock 초기화
  jest.clearAllTimers();          // 모든 타이머 정리
  jest.restoreAllMocks();         // 원본 구현 복구
});
```

### 2. 타이머 정리

```javascript
afterEach(() => {
  jest.useFakeTimers();
  // 테스트...
  jest.runAllTimers();
  jest.useRealTimers();           // 실시간 타이머로 복구 (중요!)
});
```

### 3. 이벤트 리스너 정리

```javascript
afterEach(() => {
  // 등록한 리스너 모두 제거
  document.removeEventListener('click', handleClick);
  element.off('change');
  emitter.removeAllListeners();
});
```

### 4. 파일 정리

```javascript
afterEach(async () => {
  // 테스트가 생성한 파일 삭제
  if (fs.existsSync('test-file.txt')) {
    fs.unlinkSync('test-file.txt');
  }
});
```

### 5. 데이터베이스 정리

```javascript
afterEach(async () => {
  // 테스트 데이터 삭제
  await db.collection('users').deleteMany({});
});

afterAll(async () => {
  // 전체 후 연결 종료
  await db.disconnect();
});
```

### 6. 전역 상태 정리

```javascript
afterEach(() => {
  // 전역 변수 초기화
  globalThis.testData = null;
  sessionStorage.clear();
  localStorage.clear();
});
```

---

## 실전 체크리스트

### beforeEach/afterEach 구조

```javascript
describe('기능 테스트', () => {
  // ✅ 필요한가?
  let mockData;
  
  beforeEach(() => {
    // 각 테스트 전 준비
    mockData = { name: 'John', age: 30 };
    jest.spyOn(console, 'log');
  });
  
  afterEach(() => {
    // 각 테스트 후 정리 (필수!)
    jest.restoreAllMocks();
    mockData = null;
  });
  
  test('test 1', () => {
    // ...
  });
  
  test('test 2', () => {
    // ...
  });
});
```

**체크리스트**:
- [ ] Mock 사용하면 `jest.clearAllMocks()` 또는 `jest.restoreAllMocks()` 포함?
- [ ] Fake Timer 사용하면 `jest.useRealTimers()` 포함?
- [ ] 이벤트 리스너 추가하면 제거 로직 포함?
- [ ] 파일/DB 수정하면 정리 로직 포함?
- [ ] 전역 변수 수정하면 초기화 로직 포함?

---

## 언어별 예제

### JavaScript/Jest

```javascript
describe('UserService', () => {
  let userService;
  
  beforeEach(() => {
    userService = new UserService();
    jest.spyOn(console, 'error').mockImplementation();
  });
  
  afterEach(() => {
    jest.restoreAllMocks();  // console.error mock 제거
  });
  
  test('should create user', () => {
    const user = userService.create('John');
    expect(user.name).toBe('John');
  });
});
```

### Python/pytest

```python
class TestUserService:
    @pytest.fixture(autouse=True)
    def setup_teardown(self):
        # Setup
        self.user_service = UserService()
        yield  # 테스트 실행
        # Teardown (정리)
        self.user_service.cleanup()
    
    def test_should_create_user(self):
        user = self.user_service.create('John')
        assert user.name == 'John'
```

---

## 흔한 실수 & 해결책

| 실수 | 증상 | 해결책 |
|------|------|--------|
| Mock 비정리 | 테스트 간헐 실패 | `afterEach`에 `jest.clearAllMocks()` |
| Fake Timer 미복구 | 실시간 테스트 느려짐 | `jest.useRealTimers()` 호출 |
| 이벤트 리스너 누적 | 중복 이벤트 발생 | `removeEventListener` 또는 `off()` |
| 파일 안 지워짐 | 다음 테스트 충돌 | `afterEach`에 삭제 로직 |
| 데이터 남음 | DB 테스트 오염 | `afterEach` 또는 `afterAll`에서 정리 |

---

## 다른 스킬과의 관계

### FIRST 원칙과의 연계

```
FIRST의 "Independent (독립성)"를 보장하는 방법:

beforeEach/Setup → 각 테스트 독립적 상태 준비
afterEach/Teardown → 이전 테스트 흔적 제거 (핵심!)

Teardown 없음 = Independent 원칙 위반 ❌
```

### One Assertion Concept과의 연계

```
테스트가 "하나의 개념"만 검증하려면:
→ Teardown이 철저해야 여러 테스트가 간섭 없이 독립적으로 개념 검증 가능
```

### 경계값/예외 테스트와의 연계

```
경계값과 예외를 다양하게 테스트할 때:
→ 각 테스트의 mock 상태가 정확히 초기화되어야 올바른 검증 가능
```

---

## 빠른 Cleanup 체크리스트

테스트 작성 후 다음을 확인하세요:

**각 테스트 후 (afterEach)**
- [ ] 모든 mock 정리? → `jest.clearAllMocks()`
- [ ] 타이머 정리? → `jest.useRealTimers()`
- [ ] 이벤트 리스너 제거? → `removeEventListener` 또는 `off()`
- [ ] 임시 파일 삭제? → `fs.unlinkSync()`
- [ ] 전역 상태 초기화? → `variable = null`

**전체 테스트 후 (afterAll)**
- [ ] DB 연결 종료? → `db.disconnect()`
- [ ] 서버 중지? → `server.close()`
- [ ] 생성한 폴더 삭제? → `fs.rmdirSync()`
- [ ] 리소스 해제? → `resource.release()`

---

## 최소 Teardown 템플릿

```javascript
describe('MyFeature', () => {
  afterEach(() => {
    // 최소 필수 정리
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  test('should work', () => {
    // ...
  });
});
```

---

## 다음 단계

1. **기존 테스트 검토** → Teardown 누락된 테스트 찾기
2. **afterEach 추가** → Mock/Timer/Listener 정리
3. **복잡한 테스트?** → 정리 로직 추가 또는 테스트 분리
4. **팀 표준화** → 템플릿 정의 및 문서화

---

## 참고: Setup vs Teardown

```javascript
describe('Complete Lifecycle', () => {
  let resource;
  
  beforeEach(() => {
    // Setup: 각 테스트 전
    resource = new Resource();
    console.log('Setup 실행');
  });
  
  test('test 1', () => {
    console.log('Test 1 실행');
  });
  // → Setup 실행 → Test 1 실행 → Teardown 실행
  
  afterEach(() => {
    // Teardown: 각 테스트 후
    resource.cleanup();
    console.log('Teardown 실행');
  });
});
```

**실행 순서**:
```
Test 1: beforeEach → test('test 1') → afterEach
Test 2: beforeEach → test('test 2') → afterEach
Test 3: beforeEach → test('test 3') → afterEach
```

---

## 마지막 팁

### 1. afterEach는 테스트 분리의 핵심
- 없으면 → 테스트가 서로 영향
- 있으면 → 각 테스트가 깨끗한 상태로 시작

### 2. Mock/Timer 초기화는 필수
- 가장 흔한 누락
- 테스트가 간헐 실패하면 가장 먼저 확인

### 3. 파일/DB는 afterAll이 효율적
- 매 테스트마다 연결 끊으면 느림
- 테스트 스위트 전체 후 한 번만 정리

### 4. 정리 로직도 테스트하기
```javascript
afterEach(() => {
  // cleanup()이 정말 동작하는지 확인
  expect(resource.state).toBe('cleaned');
});
```
