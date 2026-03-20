# PdfService TDD 테스트 코드 - 실행 가이드

## 개요
이 문서는 PdfService의 6가지 테스트 파일 실행 방법과 설정 방법을 설명합니다.

---

## 📋 테스트 파일 목록

| 파일명 | 테스트 대상 | 테스트 수 | 설명 |
|--------|-----------|---------|------|
| `pdfService.urlPathConversion.test.js` | `convertRelativeToAbsolutePaths()` | 10개 | 상대경로를 절대경로로 변환하는 로직 |
| `pdfService.cssConversion.test.js` | `convertCssUrlsToProxyAsset()` | 25개 | CSS url()을 proxy-asset으로 변환 |
| `pdfService.previewData.test.js` | `async getPreviewData()` | 20개 | Notion 페이지 미리보기 데이터 수집 |
| `pdfService.pdfGeneration.test.js` | `async generatePdf()` | 22개 | PDF 생성 프로세스 |
| `pdfService.resourceCleanup.test.js` | `async _cleanupPageResources()` | 24개 | 페이지 리소스 정리 |
| `pdfService.serviceCleanup.test.js` | `async close()` | 22개 | 서비스 종료 및 정리 |

**총계: 123개의 테스트 케이스**

---

## 🚀 설치 및 설정

### 1. Jest 설치

```bash
npm install --save-dev jest @types/jest
```

### 2. package.json 스크립트 추가

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:unit": "jest tests/unit/",
    "test:pdfService": "jest tests/unit/pdfService",
    "test:verbose": "jest --verbose"
  }
}
```

### 3. Jest 설정 파일 (jest.config.js)

```javascript
module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/tests/unit/**/*.test.js'
    ],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/index.js'
    ],
    coverageThreshold: {
        global: {
            branches: 75,
            functions: 90,
            lines: 80,
            statements: 80
        }
    },
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    verbose: true,
    testTimeout: 10000
};
```

### 4. 테스트 설정 파일 (tests/setup.js)

```javascript
// Jest 설정 파일
// 모든 테스트 전에 실행됨

// Mock 초기화
jest.clearAllMocks();

// 환경 변수 설정 (필요시)
process.env.NODE_ENV = 'test';
```

---

## 📝 개별 테스트 실행

### URL 경로 변환 테스트
```bash
npm test -- pdfService.urlPathConversion.test.js
```
**용도**: 상대경로 변환 로직 검증
**테스트 수**: 10개
**예상 시간**: < 1초

### CSS URL 변환 테스트
```bash
npm test -- pdfService.cssConversion.test.js
```
**용도**: CSS url() 함수 변환 검증
**테스트 수**: 25개
**예상 시간**: < 1초

### 미리보기 데이터 수집 테스트
```bash
npm test -- pdfService.previewData.test.js
```
**용도**: getPreviewData() 비동기 로직 검증
**테스트 수**: 20개
**예상 시간**: 1-2초

### PDF 생성 테스트
```bash
npm test -- pdfService.pdfGeneration.test.js
```
**용도**: generatePdf() 복잡한 로직 검증
**테스트 수**: 22개
**예상 시간**: 1-2초

### 리소스 정리 테스트
```bash
npm test -- pdfService.resourceCleanup.test.js
```
**용도**: _cleanupPageResources() 정리 로직 검증
**테스트 수**: 24개
**예상 시간**: < 1초

### 서비스 종료 테스트
```bash
npm test -- pdfService.serviceCleanup.test.js
```
**용도**: close() 종료 로직 검증
**테스트 수**: 22개
**예상 시간**: < 1초

---

## 🎯 전체 테스트 실행

### 모든 테스트 실행
```bash
npm test
```
**예상 시간**: 5-10초
**결과**: 전체 123개 테스트 실행

### 감시 모드로 실행
```bash
npm run test:watch
```
**기능**: 파일 변경 시 자동으로 테스트 재실행

### 커버리지 리포트 생성
```bash
npm run test:coverage
```
**결과**: 콘솔에 커버리지 정보 출력 + `coverage/` 폴더에 HTML 리포트 생성

### 상세 출력 모드
```bash
npm run test:verbose
```
**기능**: 각 테스트의 상세한 실행 결과 출력

---

## 📊 테스트 커버리지 목표

| 메트릭 | 목표 | 현재 | 상태 |
|--------|-----|------|------|
| 라인 커버리지 | 80% | - | 🔄 |
| 분기 커버리지 | 75% | - | 🔄 |
| 함수 커버리지 | 90% | - | 🔄 |
| 명령문 커버리지 | 80% | - | 🔄 |

커버리지 리포트를 보려면:
```bash
npm run test:coverage
# 그 후 coverage/lcov-report/index.html 열기
```

---

## 🔧 테스트 작성 패턴

### AAA 패턴 (Arrange-Act-Assert)
모든 테스트는 다음 구조를 따릅니다:

```javascript
test('기능 설명', async () => {
    // Arrange: 테스트 초기화
    const input = 'test';
    const expected = 'result';
    
    // Act: 함수 실행
    const result = await functionUnderTest(input);
    
    // Assert: 결과 검증
    expect(result).toBe(expected);
});
```

### Mock 사용 패턴
```javascript
// Mock 함수 생성
jest.mock('../../src/utils/module');

// Mock 구성
mockFunction.mockResolvedValue(data);
mockFunction.mockRejectedValue(error);

// 호출 검증
expect(mockFunction).toHaveBeenCalledWith(args);
```

---

## ✅ 테스트 체크리스트

테스트 작성 시 확인할 사항:

- [ ] 각 테스트는 독립적으로 실행 가능
- [ ] beforeEach에서 mock 초기화
- [ ] 비동기 함수는 async/await 또는 done() 사용
- [ ] 에러 케이스도 테스트
- [ ] Edge case 테스트
- [ ] 명확한 테스트 설명 (describe, test)
- [ ] 적절한 assertion 사용
- [ ] Mock 호출 검증

---

## 🐛 디버깅 팁

### 특정 테스트만 실행
```bash
npm test -- --testNamePattern="기능 설명"
```

### 디버그 모드로 실행
```bash
node --inspect-brk ./node_modules/jest/bin/jest.js --runInBand
```

### 상세 에러 출력
```bash
npm test -- --verbose --no-coverage
```

### Mock 상태 확인
```javascript
console.log(mockFunction.mock.calls);
console.log(mockFunction.mock.results);
```

---

## 📚 테스트 케이스 카테고리

### URL 경로 변환 (10개)
- 기본 변환 (2개)
- 상위 디렉토리 (2개)
- 절대경로 처리 (3개)
- Edge case (3개)

### CSS URL 변환 (25개)
- 절대 URL 변환 (4개)
- 프록시 처리 (2개)
- Data URI (3개)
- 따옴표 처리 (5개)
- 공백 처리 (2개)
- 복수 URL (3개)
- Null/Empty (4개)
- 특수문자 (3개)
- 정규식 (2개)

### 미리보기 수집 (20개)
- 성공 케이스 (2개)
- 너비 감지 (2개)
- 리소스 수집 (5개)
- HTML 추출 (3개)
- 보안 (3개)
- 정리 (2개)
- 에러 (2개)
- 타임아웃 (1개)

### PDF 생성 (22개)
- 성공 케이스 (2개)
- 옵션 처리 (8개)
- 토글 처리 (2개)
- 뷰포트 (3개)
- PDF 생성 (3개)
- 보안 (3개)
- 에러 처리 (3개)
- 검증 (1개)

### 리소스 정리 (24개)
- 리스너 제거 (3개)
- 컨텍스트 초기화 (4개)
- 페이지 종료 (4개)
- Null 처리 (2개)
- 에러 처리 (5개)
- 호출 순서 (1개)
- 비동기 (3개)
- 멱등성 (2개)
- 유즈 케이스 (2개)

### 서비스 종료 (22개)
- 정상 종료 (4개)
- 에러 처리 (5개)
- 상태 검증 (2개)
- 비동기 (3개)
- 반환값 (2개)
- 멱등성 (2개)
- 리소스 정리 (2개)
- 시나리오 (3개)
- 에러 복구 (2개)

---

## 🏆 테스트 실행 결과 예시

```
PASS  tests/unit/pdfService.urlPathConversion.test.js
  PdfService - URL 경로 변환 (convertRelativeToAbsolutePaths)
    기본 상대경로 변환
      ✓ 상대 경로를 절대 경로로 변환해야 함 (2ms)
      ✓ 여러 리소스의 상대 경로를 모두 변환해야 함 (1ms)
    ...
    
Test Suites: 6 passed, 6 total
Tests:       123 passed, 123 total
Snapshots:   0 total
Time:        8.234 s
```

---

## 📖 참고 자료

- [Jest 공식 문서](https://jestjs.io/)
- [TDD 가이드](https://en.wikipedia.org/wiki/Test-driven_development)
- [Mocking 패턴](https://jestjs.io/docs/mock-functions)

---

## 💡 다음 단계

1. **통합 테스트**: 여러 함수 간 상호작용 테스트
2. **E2E 테스트**: 실제 PDF 생성 end-to-end 테스트
3. **성능 테스트**: PDF 생성 속도 측정
4. **메모리 테스트**: 메모리 누수 검사

---

**마지막 업데이트**: 2026년 3월 20일
