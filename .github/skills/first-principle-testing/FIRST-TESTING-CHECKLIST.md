---
file_name: FIRST-TESTING-CHECKLIST.md
description: FIRST 원칙별 실행 체크리스트
---

# FIRST 테스트 원칙 - 실행 체크리스트

## 테스트 작성 전 (Pre-Writing)

### 요구사항 명확히
- [ ] 테스트할 함수/메서드 식별
- [ ] 입력값과 예상 출력 정의
- [ ] 엣지 케이스 나열
- [ ] 외부 의존성 식별 (API, DB, 파일시스템 등)

---

## 작성 중 (During Writing)

### 1. 독립성 확보
- [ ] beforeEach에서 필요한 모든 객체 생성
- [ ] afterEach에서 리소스 정리 (mock 초기화, 파일 삭제 등)
- [ ] 공유 변수 제거
- [ ] 각 테스트가 다른 테스트와 격리되어 있는지 확인

### 2. 속도 최적화
- [ ] 모든 외부 API 호출 모킹
- [ ] 데이터베이스 쿼리 모킹
- [ ] 파일 I/O 제거 (메모리 구현 또는 모킹)
- [ ] setTimeout 제거 또는 jest.useFakeTimers() 사용
- [ ] heavy 계산 최소화 또는 경량 버전 사용

### 3. 명확성 보장
- [ ] 테스트 이름이 "should..."로 시작
- [ ] 3-5개 이하의 어설션 사용
- [ ] 각 어설션값이 구체적이고 명확
- [ ] 실패 시 오류 메시지 커스터마이징
- [ ] AAA 패턴 준수: Arrange → Act → Assert

### 4. 반복성 보장
- [ ] 난수 모킹 (예: Math.random())
- [ ] 시간/날짜 의존성 제거 또는 모킹
- [ ] 환경 변수 고정
- [ ] 외부 상태에 의존하지 않음

### 5. 적시성 확인
- [ ] 기능 구현 전에 작성됨 (TDD를 따르는 경우)
- [ ] 버그 재발 방지를 위해 테스트 추가됨
- [ ] 엣지 케이스가 커버됨

---

## 작성 후 (Post-Writing)

### 로컬 검증
- [ ] `npm test` 실행 - 모두 통과
- [ ] 선택적 단독 실행 가능 (`.only`)
- [ ] 테스트 순서 변경 후에도 모두 통과
- [ ] 5회 연속 실행해서 항상 통과

### 성능 검증
- [ ] 실행 시간 확인 (< 100ms/테스트 권장)
- [ ] 전체 테스트 스위트 실행 시간 < 10초

### 코드 품질 검증
```bash
# 테스트 커버리지 확인
npm test -- --coverage

# 커버리지 목표: 80% 이상
# - Statements: 80%
# - Branches: 75%
# - Functions: 80%
# - Lines: 80%
```

### 리뷰 체크리스트
- [ ] 테스트가 기능을 정확히 검증하는가?
- [ ] 거짓 양성(false positive)이 없는가?
- [ ] 다른 개발자가 이해하기 쉬운가?
- [ ] 유지보수가 용이한가?

---

## 공통 패턴

### 모킹 패턴
```javascript
// API 모킹
jest.spyOn(global, 'fetch').mockResolvedValue(response);

// 모듈 모킹
jest.mock('../api');
api.fetchData.mockResolvedValue(data);

// 파일시스템 모킹
jest.mock('fs');
fs.readFile.mockImplementation((path, cb) => cb(null, content));

// 타이머 모킹
jest.useFakeTimers();
jest.advanceTimersByTime(1000);
jest.useRealTimers();
```

### 에러 테스트
```javascript
// 예외 검증
expect(() => { dangerous(); }).toThrow();
expect(() => { dangerous(); }).toThrow(TypeError);
expect(() => { dangerous(); }).toThrow('specific message');

// 비동기 예외
await expect(asyncDangerous()).rejects.toThrow();
```

### 데이터 검증
```javascript
// 부분 일치
expect(result).toMatchObject({ id: 1, name: 'Test' });

// 배열 포함
expect(results).toContainEqual({ id: 1 });

// 정규식 매칭
expect(email).toMatch(/^[\w.-]+@[\w.-]+\.\w+$/);

// 함수 호출 검증
expect(mockFn).toHaveBeenCalledWith(expectedArg);
expect(mockFn).toHaveBeenCalledTimes(1);
```

---

## 문제 해결

| 증상 | 원인 | 해결책 |
|------|------|--------|
| 테스트가 느림 (> 100ms) | 외부 요청, DB 접근 | 모킹 추가 |
| 간헐적 실패 | 타이밍, 순서 의존 | `beforeEach`/`afterEach`, `jest.useFakeTimers()` |
| 난해한 오류 | 일반적 어설션 | 커스텀 메시지, BDD 스타일 |
| 고립 불가 | 공유 상태 | 격리 로직 추가 |
| 커버리지 낮음 | 테스트 누락 | 중요 경로와 엣지 케이스 확인 |

---

## 사용 예시

### 작성 전
```bash
# 결과:
# - 테스트할 함수 식별
# - 입력/출력 정의
# - 외부 의존성 확인
```

### 작성 중
```bash
# 결과:
# - 독립적, 빠른, 명확한 테스트
# - 안정적이고 유지보수 가능
```

### 작성 후
```bash
npm test -- --coverage
npm test -- --watch

# 결과:
# - 모두 통과 (< 10초)
# - 커버리지 > 80%
```
