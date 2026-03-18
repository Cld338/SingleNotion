# Chrome Extension Testing Guide

이 문서는 Chrome Extension과 서버 간의 통합을 테스트하기 위한 단계별 가이드입니다.

## 사전 준비

### 1. 서버 실행

```bash
# 프로젝트 루트 디렉토리에서
npm install  # 의존성 설치 (이미 설치된 경우 스킵)
npm start    # 개발 서버 시작

# 예상 출력:
# Server running on port 3000
# Redis connected
```

### 2. Redis 실행

Redis가 실행 중인지 확인하세요 (Docker Compose 권장):

```bash
docker-compose up -d redis
```

또는 로컬 Redis:
```bash
redis-server
```

### 3. 확장 프로그램 로드

[extension/README.md](./README.md)의 "설치 방법" 섹션을 참고하여 확장 프로그램을 로드하세요.

## 단계별 테스트

### 테스트 1: 확장 프로그램 로드 확인

**목표**: 확장 프로그램이 올바르게 로드되었는지 확인

1. Chrome 열기
2. 주소창에 `chrome://extensions` 입력
3. "Notion to PDF" 확장 프로그램이 활성화되어 있는지 확인
4. 콘솔 확인 (F12 > 확장 프로그램):
   ```
   [Notion-PDF] Background service worker initialized
   ```

**예상 결과**: ✅ 확장 프로그램이 활성화되었고 Background Service Worker가 실행 중

---

### 테스트 2: Notion 페이지에서 팝업 표시

**목표**: Notion 페이지에서 확장 프로그램 팝업이 표시되는지 확인

1. Notion 페이지 방문: https://www.notion.so/test-page...
2. 브라우저 우측 상단에서 확장 프로그램 아이콘 클릭
3. 팝업이 표시되는지 확인
4. 팝업의 버튼이 활성화되어 있는지 확인

**예상 결과**: ✅ 팝업이 표시되고 "캡처 & 전송" 버튼이 클릭 가능

---

### 테스트 3: 페이지 캡처 및 서버 전송

**목표**: 페이지가 캡처되고 서버로 전송되는지 확인

#### 3-1. 개발자 도구 열기

```
F12 또는 Ctrl+Shift+I (Windows) / Cmd+Option+I (Mac)
```

#### 3-2. 콘솔 탭 확인

Console 탭에서 다음과 같은 로그를 확인하세요:

```
[Notion-PDF] Content script loaded on https://www.notion.so/...
[Notion-PDF] Server URL: https://notion-pdf.cld338.me
```

#### 3-3. 캡처 버튼 클릭

팝업에서 "캡처 & 전송" 버튼을 클릭합니다.

#### 3-4. 로그 확인

콘솔에서 다음 로그를 확인합니다:

```
[Notion-PDF] Capture request received
[Notion-PDF] Starting page capture...
[Notion-PDF] Converting images to base64...
[Notion-PDF] Image converted to base64: data:image/png;base64,...
[Notion-PDF] Image load failed (CORS or network), keeping original URL: https://...
[Notion-PDF] Capture complete { 
  htmlLength: 1234567,
  cssLinks: 3,
  inlineStyles: 5
}
```

**참고**: `Image load failed` 로그는 **정상 동작**입니다.
- Notion의 CDN 이미지는 CORS 제약이 있습니다
- 이 경우 **원본 URL을 유지**하므로 이미지가 최종적으로는 표시됩니다
- 변환됨: 로컬 이미지는 base64로 변환됨
- 미변환: CDN 이미지는 원본 URL 유지 (화질 손실 없음)

#### 3-5. 서버 로그 확인

서버 터미널에서 다음 로그가 출력되는지 확인합니다:

```
info: Extension data stored - SessionId: a1b2c3d4e5f6..., URL: https://www.notion.so/..., HTML size: 1234567 bytes
```

**예상 결과**: ✅ 콘솔에 캡처 로그가 표시되고 서버에서 세션 저장 로그가 출력됨

---

### 테스트 4: 자동 리다이렉트와 편집 페이지 로드

**목표**: 데이터가 올바르게 저장되고 편집 페이지로 리다이렉트되는지 확인

#### 4-1. 팝업 상태 확인

캡처 완료 후 팝업에서 다음이 표시되는지 확인하세요:

```
✓ 전송 완료! 편집 페이지로 이동합니다.
```

#### 4-2. 자동 탭 오픈 확인

약 1초 후 새 탭이 자동으로 열리고 다음 URL로 이동하는지 확인:

```
https://notion-pdf.cld338.me/standard-edit?sessionId=a1b2c3d4e5f6...&source=extension
```

#### 4-3. 편집 페이지 로드 확인

편집 페이지에서:
- 로딩 스피너가 표시되고 사라짐
- Notion 콘텐츠가 로드됨
- 옆의 사이드바가 표시됨

*개발자 도구*의 Network 탭에서 다음 요청을 확인하세요:

```
GET /session-data/a1b2c3d4e5f6...  [Status: 200]
```

**예상 결과**: ✅ 새 탭이 열리고 편집 페이지가 정상적으로 로드됨

---

### 테스트 5: PDF 생성 및 다운로드

**목표**: 편집 페이지에서 PDF가 정상적으로 생성되는지 확인

#### 5-1. 포맷 선택

좌측 사이드바에서:
- 포맷: "A4" 선택
- 여백: 기본값 (Top: 50, Bottom: 50, Left: 50, Right: 50)

#### 5-2. PDF 생성

"**PDF 다운로드**" 버튼을 클릭합니다.

#### 5-3. 다운로드 확인

다음을 확인합니다:
- 브라우저에서 PDF 다운로드 시작
- 파일명: `notion-<timestamp>.pdf`
- 파일 크기: 0 bytes가 아님 (예: 2.5 MB)

#### 5-4. PDF 내용 확인

다운로드된 PDF를 열어서:
- 콘텐츠가 올바르게 렌더링되었는지 확인
- 이미지가 표시되는지 확인
- 텍스트가 올바르게 인코딩되었는지 확인

**예상 결과**: ✅ PDF가 정상적으로 다운로드되고 콘텐츠가 올바르게 표시됨

---

## 네트워크 요청 분석 (Network 탭)

개발자 도구의 Network 탭에서 다음 요청들이 올바르게 진행되는지 확인하세요:

### 확장 프로그램 캡처 단계

```
[POST] https://notion-pdf.cld338.me/render-from-extension
Status: 200
Headers:
  Content-Type: application/json
Response:
  {
    "success": true,
    "sessionId": "a1b2c3d4e5f6..."
  }
```

### 편집 페이지 로드 단계

```
[GET] https://notion-pdf.cld338.me/session-data/a1b2c3d4e5f6...
Status: 200
Headers:
  Content-Type: application/json
Response:
  {
    "html": "<html>...</html>",
    "detectedWidth": 1080,
    "resources": { "cssLinks": [...], "inlineStyles": [...] },
    "metadata": { ... },
    "source": "extension"
  }
```

### CSS 리소스 로드

```
[GET] https://cdn.jsdelivr.net/... (각 CSS 파일)
Status: 200
```

---

## 에러 처리 테스트

### 테스트 6: 유효하지 않은 세션 ID

**목표**: 잘못된 세션 ID로 접근했을 때 올바른 에러를 반환하는지 확인

#### 6-1. 잘못된 URL로 접근

브라우저 주소창에 직접 입력:

```
https://notion-pdf.cld338.me/standard-edit?sessionId=invalid-session-id&source=extension
```

#### 6-2. 에러 확인

페이지가 로드되고 개발자 도구 콘솔에서:

```
Error: 세션을 찾을 수 없습니다. 세션이 만료되었을 수 있습니다.
```

**예상 결과**: ✅ 사용자 친화적인 에러 메시지 표시

---

### 테스트 7: 세션 만료

**목표**: 1시간 후 세션이 자동으로 만료되는지 확인 (선택 사항, 시간 단축 테스트)

#### 7-1. 테스트 환경 설정 (선택)

Redis의 TTL을 단축하여 테스트:

```javascript
// src/routes/pdf.js의 redisConnection.setex 함수에서
await redisConnection.setex(
    `session:${sessionId}`,
    60,  // 60초로 변경 (테스트용)
    JSON.stringify(sessionData)
);
```

#### 7-2. 세션 저장 후 대기

데이터 캡처 후 61초 이상 대기합니다.

#### 7-3. 편집 페이지 새로고침

편집 페이지에서 F5를 눌러 새로고침합니다.

**예상 결과**: ✅ 세션 만료 에러 메시지 표시

---

## 성능 테스트

### 테스트 8: 대용량 페이지 처리

**목표**: 큰 용량의 페이지가 올바르게 처리되는지 확인

#### 8-1. 큰 Notion 페이지 선택

다음 특성을 가진 Notion 페이지 선택:
- 이미지 많음 (10개 이상)
- 텍스트 많음 (스크롤 필요)
- 테이블/embedded content

#### 8-2. 캡처 시간 측정

콘솔에서 메시지 시간 차이 확인:

```
[Notion-PDF] Starting page capture...  <- 시작 시간 기록
[Notion-PDF] Capture complete         <- 종료 시간 기록
```

#### 8-3. 성능 평가

예상 처리 시간: 3-10초 (페이지 크기에 따라)

**예상 결과**: ✅ 30초 이내에 캡처 완료

---

## 브라우저 호환성 테스트 (선택)

### 테스트 9: Chrome vs Edge

각 브라우저에서 이전 테스트들을 반복합니다:

**Chrome**:
- 버전 90+ 권장
- 주소창: `chrome://extensions`

**Edge**:
- 버전 90+ 권장
- 주소창: `edge://extensions`

**예상 결과**: ✅ 두 브라우저 모두 동일 동작

---

## 디버깅 팁

### 콘솔 필터링

특정 로그만 보기:

```javascript
// 개발자 도구 콘솔에서
filter: [Notion-PDF]
```

### Network 탭 필터링

API 호출만 보기:

```
filter: /render-from-extension or /session-data
```

### 캐시 문제 해결

```
// 개발자 도구 > Network 탭 우클릭
"Disable cache" 체크
```

또는

```bash
# 강제 새로고침
Ctrl+Shift+Delete (또는 Cmd+Shift+Delete)
```

### 확장 프로그램 재로드

```
chrome://extensions > "Notion to PDF" > 새로고침 아이콘
```

---

## 체크리스트

다음 항목들을 모두 확인했을 때 구현이 완료된 것입니다:

- [ ] 확장 프로그램이 로드됨
- [ ] Notion 페이지에서 팝업이 표시됨
- [ ] "캡처 & 전송" 버튼 클릭 시 콘솔에 로그 표시
- [ ] 서버에서 세션 저장 로그 출력
- [ ] 자동으로 편집 페이지로 리다이렉트됨
- [ ] 편집 페이지에서 콘텐츠가 정상적으로 로드됨
- [ ] PDF 다운로드 기능 동작
- [ ] PDF 파일이 올바른 콘텐츠 포함
- [ ] 에러 처리 정상 동작
- [ ] 유효하지 않은 세션 ID에서 에러 메시지 표시

---

## 지원되지 않는 기능 (현재 MVP)

다음 기능들은 향후 버전에서 추가될 예정입니다:

- Firefox 지원
- 이미지 압축 옵션
- 배치 변환 (여러 페이지 동시 변환)
- 클라우드 저장소 통합
- 확장 프로그램 설정 페이지

---

**작성일**: 2026-03-17
**버전**: 0.1.0 (MVP Testing Guide)
