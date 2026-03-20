---
file_name: TEARDOWN-CLEANUP-CHECKLIST.md
description: 테스트 Teardown/정리 실행 체크리스트
---

# Test Teardown & Cleanup - 빠른 체크리스트

## 테스트 작성 시 (코드 작성)

### afterEach 필수 항목

- [ ] Mock 사용? → `jest.clearAllMocks()` 또는 `jest.restoreAllMocks()`
- [ ] Fake Timer 사용? → `jest.useRealTimers()`
- [ ] Spy 사용? → `jest.restoreAllMocks()`
- [ ] 이벤트 리스너 추가? → `removeEventListener()` 또는 `off()`

### afterAll 필수 항목

- [ ] DB 연결? → `db.disconnect()`
- [ ] 서버 실행? → `server.close()`
- [ ] 생성된 폴더? → `fs.rmdirSync()`
- [ ] 특수 리소스? → `resource.release()`

---

## 최소 템플릿

### JavaScript/Jest 기본

```javascript
describe('기능명', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });
  
  test('should work', () => {
    // ...
  });
});
```

### 복잡한 테스트

```javascript
describe('복잡한 기능', () => {
  let resource;
  
  beforeEach(() => {
    resource = new Resource();
    jest.useFakeTimers();
  });
  
  afterEach(() => {
    jest.clear AllMocks();
    jest.useRealTimers();
    resource.cleanup();
  });
  
  test('should work', () => {
    // ...
  });
});
```

### 데이터베이스 테스트

```javascript
describe('DB Integration', () => {
  beforeAll(async () => {
    await db.connect();
  });
  
  afterEach(async () => {
    // 각 테스트 후 데이터 정리
    await db.collection('users').deleteMany({});
  });
  
  afterAll(async () => {
    // 전체 후 연결 종료
    await db.disconnect();
  });
  
  test('should save user', () => {
    // ...
  });
});
```

---

## 검토 체크리스트

기존 테스트 리뷰할 때:

| 항목 | 확인 |
|------|------|
| `afterEach` 있는가? | ✓ |
| Mock 정리 포함? | ✓ |
| Timer 복구 포함? | ✓ |
| 이벤트 리스너 제거? | ✓ |
| 파일/DB 정리? | ✓ (필요시) |
| `afterAll`에서 리소스 해제? | ✓ (필요시) |

---

## 흔한 누락 패턴

### ❌ 패턴 1: Mock 미정리

```javascript
// 나쁜 예
test('should work', () => {
  jest.spyOn(console, 'log');
  // afterEach 없음 → 다음 테스트에 영향!
});
```

**해결**: `afterEach`에 `jest.restoreAllMocks()` 추가

### ❌ 패턴 2: Timer 미복구

```javascript
// 나쁜 예
test('should delay', () => {
  jest.useFakeTimers();
  // jest.useRealTimers() 안 함 → 다음 테스트 느려짐!
});
```

**해결**: `afterEach`에 `jest.useRealTimers()` 추가

### ❌ 패턴 3: Listener 누적

```javascript
// 나쁜 예
beforeEach(() => {
  element.addEventListener('click', handler);
  // removeEventListener 안 함 → 중복 바인딩!
});
```

**해결**: `afterEach`에 `element.removeEventListener('click', handler)` 추가

---

## 빠른 수정 (Quick Fix)

테스트가 간헐 실패하면 부터:

1. `afterEach`에 `jest.clearAllMocks()` 추가
2. `afterEach`에 `jest.useRealTimers()` 추가
3. 이벤트 리스너 정리 로직 확인
4. 파일/DB 정리 로직 확인

---

## 정리 우선순위

| 중요도 | 항목 | 빈도 |
|--------|------|------|
| ⭐⭐⭐ | Mock 정리 | 거의 매번 |
| ⭐⭐⭐ | Timer 복구 | Fake Timer 사용시 |
| ⭐⭐ | Event Listener | UI 테스트시 |
| ⭐⭐ | 파일 정리 | 파일 작업시 |
| ⭐⭐ | DB 정리 | 데이터 작업시 |
| ⭐ | 기타 리소스 | 필요시 |

---

## 한줄 팁

- **Mock 안 정리? → 테스트 간헐 실패 & 디버깅 지옥**
- **Timer 안 복구? → 전체 테스트 속도 급감**
- **Listener 누적? → 이상한 동작 반복**
- **DB 안 정리? → 테스트 오염 & 데이터 충돌**
