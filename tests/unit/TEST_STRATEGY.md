# PdfService TDD 테스트 전략

## 개요
PdfService 클래스의 모든 메서드에 대한 단위 테스트(Unit Test)를 작성합니다.
각 테스트 파일은 기능별로 분리됩니다.

---

## 1. convertRelativeToAbsolutePaths (URL 경로 변환)

### 테스트 파일: `pdfService.urlPathConversion.test.js`

#### 테스트 목표
- 상대경로를 절대경로로 올바르게 변환

#### 테스트 케이스
1. **기본 상대경로 변환**
   - 입력: `<img src="image.png">` + baseUrl="https://notion.so/page"
   - 예상: `<img src="https://notion.so/image.png">`

2. **상위 디렉토리 경로 변환**
   - 입력: `<img src="../assets/image.png">`
   - 예상: 절대경로로 변환됨

3. **절대경로 URL은 변경 없음**
   - 입력: `<img src="https://example.com/image.png">`
   - 예상: 그대로 유지

4. **여러 리소스 포함 HTML**
   - 입력: 이미지, 링크, 스크립트 등 복합 HTML
   - 예상: 모두 절대경로로 변환

5. **빈 baseUrl 또는 null 처리**
   - 입력: baseUrl이 없거나 null
   - 예상: 에러 처리 또는 기본값 사용

#### Mock 필요
- URLPathConverter.convertAll 메서드

---

## 2. convertCssUrlsToProxyAsset (CSS URL 변환)

### 테스트 파일: `pdfService.cssConversion.test.js`

#### 테스트 목표
- CSS의 url() 함수 경로를 proxy-asset으로 올바르게 변환

#### 테스트 케이스
1. **절대 URL 변환 (http://)**
   - 입력: `url("http://example.com/icon.svg")`
   - 예상: `url('/proxy-asset?url=http%3A%2F%2Fexample.com%2Ficon.svg')`

2. **절대 URL 변환 (https://)**
   - 입력: `url("https://notion.site/icon.svg")`
   - 예상: `url('/proxy-asset?url=...')`

3. **프로토콜 상대 URL 변환 (//)**
   - 입력: `url("//cdn.example.com/style.css")`
   - 예상: `url('/proxy-asset?url=https://cdn.example.com/...')`

4. **이미 프록시된 경로는 변경 없음**
   - 입력: `url('/proxy-asset?url=...')`
   - 예상: 그대로 유지

5. **Data URI는 변경 없음**
   - 입력: `url('data:image/svg+xml;...')`
   - 예상: 그대로 유지

6. **따옴표 없는 URL**
   - 입력: `url(http://example.com/icon.svg)`
   - 예상: proxy-asset으로 변환

7. **공백이 있는 URL**
   - 입력: `url( "http://example.com/icon.svg" )`
   - 예상: 공백 제거 후 변환

8. **null 또는 빈 문자열**
   - 입력: null, ""
   - 예상: 그대로 반환

9. **여러 url() 포함**
   - 입력: `background-image: url(...); border-image: url(...)`
   - 예상: 모두 변환

---

## 3. getPreviewData (미리보기 데이터 수집)

### 테스트 파일: `pdfService.previewData.test.js`

#### 테스트 목표
- Notion 페이지 분석 및 미리보기 데이터 정확한 수집
- 비동기 작업 및 리소스 정리 검증

#### 테스트 케이스
1. **성공적 데이터 수집**
   - URL 로드 성공
   - 모든 리소스 수집 완료
   - 결과 반환 검증

2. **콘텐츠 너비 감지**
   - `.notion-page-content` 너비 올바르게 감지
   - 기본값 1080px 반환 (요소 없을 때)

3. **리소스 수집**
   - CSS 링크 수집
   - 이미지 URL 수집
   - 아이콘 수집
   - 웹 폰트 수집
   - 스크립트 수집
   - KaTeX 리소스 수집
   - 비디오/미디어 수집

4. **HTML 코드 추출**
   - 배너 포함/제외 옵션 검증
   - 제목 포함/제외 옵션 검증
   - 태그 포함/제외 옵션 검증
   - HTML 경로 절대경로 변환

5. **에러 처리**
   - 잘못된 URL (Notion 도메인 아님)
   - 로컬 호스트 URL
   - 보안상 차단된 요청

6. **정리 작업**
   - page 인스턴스 정리 호출
   - browserPool에 브라우저 반환

7. **타임아웃 처리**
   - 페이지 로드 완료 대기

#### Mock 필요
- browserPool.acquire()
- page.newPage()
- page.goto()
- page.evaluate()
- page.setRequestInterception()
- browserPool.release()

#### Stub 필요
- URLPathConverter.convertAll
- logger 메서드

---

## 4. generatePdf (PDF 생성)

### 테스트 파일: `pdfService.pdfGeneration.test.js`

#### 테스트 목표
- PDF 생성 프로세스 검증
- 스트림 반환 및 정리 검증

#### 테스트 케이스
1. **성공적 PDF 생성**
   - 페이지 로드 완료
   - 토글 블록 펼치기 실행
   - KaTeX CSS 주입 실행
   - 동적 레이아웃 CSS 생성
   - PDF 스트림 반환 검증

2. **옵션 처리**
   - includeBanner 옵션
   - includeTitle 옵션
   - includeTags 옵션
   - includeDiscussion 옵션
   - marginTop, marginBottom, marginLeft, marginRight 옵션
   - pageWidth 옵션
   - screenshotPath 옵션

3. **토글 블록 처리**
   - 중첩된 토글 모두 펼치기
   - 최대 반복 횟수 제한 (무한 루프 방지)

4. **스트림 정리**
   - 스트림 'close' 이벤트 시 페이지 정리
   - 스트림 'error' 이벤트 시 리소스 정리

5. **에러 처리**
   - 페이지 로드 실패
   - PDF 생성 실패
   - 에러 발생 시 리소스 정리

6. **뷰포트 설정**
   - 초기 뷰포트 설정 (3000x1000)
   - 최종 뷰포트 재설정

7. **KaTeX 렌더링 검증**
   - KaTeX 요소 감지
   - 폰트 로드 확인

#### Mock 필요
- browserPool.acquire()
- page.newPage()
- page.goto()
- page.evaluate()
- page.addStyleTag()
- page.setViewport()
- page.createPDFStream()
- Readable.fromWeb()

#### Stub 필요
- logger 메서드
- CSSTemplates.generateDynamicLayoutCSS

---

## 5. _cleanupPageResources (리소스 정리)

### 테스트 파일: `pdfService.resourceCleanup.test.js`

#### 테스트 목표
- 페이지 리소스 올바른 정리 검증

#### 테스트 케이스
1. **이벤트 리스너 제거**
   - page.removeAllListeners() 호출 검증

2. **페이지 컨텍스트 초기화**
   - page.evaluate() 호출 검증
   - 콜백 함수가 전역 변수 정리 수행

3. **페이지 종료**
   - page.close() 호출 검증

4. **null 페이지 처리**
   - page가 null이면 아무 작업도 수행하지 않음

5. **evaluate 실패 처리**
   - evaluate 에러도 후속 단계 계속 진행
   - 로그 기록

6. **close 실패 처리**
   - close 중 에러도 로그 기록

#### Mock 필요
- page 객체 및 메서드
- page.evaluate()
- page.close()

#### Stub 필요
- logger.warn
- logger.debug

---

## 6. close (서비스 종료)

### 테스트 파일: `pdfService.serviceCleanup.test.js`

#### 테스트 목표
- 서비스 정상 종료 및 리소스 정리 검증

#### 테스트 케이스
1. **정상 종료**
   - browserPool.drain() 호출
   - browserPool.clear() 호출

2. **정상적 순서**
   - drain 실행 후 clear 실행

3. **에러 처리**
   - drain 실패 시에도 clear 시도
   - clear 실패 시 로그 기록

4. **여러 번 호출**
   - 안전하게 여러 번 호출 가능

#### Mock 필요
- browserPool.drain()
- browserPool.clear()

#### Stub 필요
- logger.warn

---

## 테스트 설정

### 테스트 프레임워크
- **Jest** (테스트 러너 및 assertion 라이브러리)
- **jest.mock()** (자동 모킹)
- **jest.spyOn()** (spy 생성)

### 테스트 라이브러리
- **jest.mock()** - 모듈 모킹
- **jest.fn()** - 함수 모킹
- **jest.spyOn()** - 메서드 spy
- **beforeEach/afterEach** - 테스트 전후 설정

### 설정 파일
- `jest.config.js` - Jest 설정
- `.env.test` - 테스트 환경 변수

---

## 테스트 실행 방법

```bash
# 전체 테스트 실행
npm test

# 특정 테스트 파일만 실행
npm test -- pdfService.urlPathConversion.test.js

# 감시 모드
npm test -- --watch

# 커버리지 리포트
npm test -- --coverage
```

---

## 테스트 커버리지 목표
- 라인 커버리지: 80% 이상
- 분기 커버리지: 75% 이상
- 함수 커버리지: 90% 이상

---

## 주의사항

1. **비동기 작업**: async/await 또는 done() 콜백 사용
2. **타임아웃**: 장시간 작업은 timeout 설정
3. **모킹**: 외부 API(browserPool, Puppeteer) 모킹 필수
4. **정리**: 각 테스트 후 모든 mock 정리
5. **격리**: 각 테스트는 독립적으로 실행 가능해야 함
