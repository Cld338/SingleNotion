# Notion to PDF - Chrome Extension

Chrome Extension을 통해 Notion 페이지를 직접 캡처하여 즉시 PDF로 변환할 수 있습니다.

## 기능

- ✅ Notion 페이지에서 클릭 한 번으로 콘텐츠 캡처
- ✅ 모든 이미지를 base64 데이터로 자동 변환
- ✅ CSS 스타일 자동 수집
- ✅ 서버에서 즉시 편집 페이지로 이동
- ✅ Puppeteer 렌더링 없이 빠른 처리

## 설치 방법

### 1. 개발 환경에서 로드하기 (Chrome/Edge)

#### Windows:

```bash
# 1. Chrome/Edge 열기
# 주소창에 다음을 입력:
chrome://extensions
# 또는 Edge:
edge://extensions

# 2. "개발자 모드" 활성화
# 우측 상단의 "개발자 모드" 토글을 ON으로 설정

# 3. "확장 프로그램 압축 풀기" 클릭
# 다음 폴더 선택:
C:\workspace\notion-pdf\SinglePagedNotionPDF\extension
```

#### macOS:

```bash
# 1. Chrome 열기
# CMD + Shift + J 또는 메뉴 > 기타 도구 > 확장 프로그램

# 2. "개발자 모드" 활성화
# 우측 상단의 "개발자 모드" 토글을 ON으로 설정

# 3. "확장 프로그램 압축 풀기" 클릭
# 다음 폴더 선택:
~/workspace/notion-pdf/SinglePagedNotionPDF/extension
```

### 2. 서버 URL 설정

확장 프로그램의 `popup.js` 파일에서 `CONFIG.SERVER_URL`을 수정하세요:

```javascript
const CONFIG = {
    SERVER_URL: 'https://notion-pdf.cld338.me', // 개발 환경
    // 프로덕션: 'https://your-production-url.com'
};
```

## 사용 방법

### 1. Notion 페이지 방문

Notion 페이지(https://www.notion.so/...)에 접속합니다.

### 2. 확장 프로그램 클릭

브라우저 우측 상단의 확장 프로그램 아이콘(Notion to PDF)을 클릭하면 팝업이 나타납니다.

### 3. "캡처 & 전송" 클릭

- 팝업의 **"캡처 & 전송"** 버튼을 클릭합니다
- 페이지가 캡처되고 서버로 전송됩니다
- 자동으로 편집 페이지가 열립니다

### 4. PDF 만들기

편집 페이지에서:
- 포맷 선택 (A4, A3, Letter 등)
- 여백 설정
- 표시 옵션 조정 (제목, 커버, 속성)
- **"PDF 다운로드"** 버튼 클릭

## 기술 스택

- **Manifest Version**: 3 (최신 Chrome/Edge 표준)
- **콘텐츠 스크립트**: 페이지 DOM 캡처
- **Service Worker**: 확장 프로그램 관리
- **API 통신**: REST POST/GET

## 파일 구조

```
extension/
├── manifest.json          # 확장 프로그램 설정
├── popup.html            # 팝업 UI
├── popup.js              # 팝업 로직
├── content.js            # DOM 캡처 스크립트
├── background.js         # Service Worker
└── README.md             # 이 파일
```

## 서버 엔드포인트

### POST /render-from-extension

확장 프로그램에서 캡처한 데이터를 받습니다.

**Request:**
```json
{
  "html": "<html>...</html>",
  "resources": {
    "cssLinks": ["https://..."],
    "inlineStyles": ["body { ... }"]
  },
  "metadata": {
    "url": "https://www.notion.so/...",
    "title": "Notion Page Title",
    "timestamp": "2026-03-17T10:30:00.000Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "a1b2c3d4e5...",
  "message": "데이터가 저장되었습니다."
}
```

### GET /session-data/:sessionId

저장된 세션 데이터를 조회합니다.

**Response:**
```json
{
  "html": "<html>...</html>",
  "detectedWidth": 1080,
  "resources": { ... },
  "metadata": { ... },
  "source": "extension"
}
```

## 문제 해결

### 1. "콘텐츠 스크립트 오류" 메시지 표시

**원인**: Notion 페이지가 완전히 로드되지 않았거나 CORS 문제

**해결책**:
1. 페이지를 새로고침하고 완전히 로드될 때까지 기다립니다
2. 개발자 도구(F12)에서 콘솔 에러를 확인합니다
3. 확장 프로그램을 다시 로드합니다 (주소창에 `chrome://extensions` 입력)

### 2. 이미지가 로드되지 않습니다 (CORS 에러)

**원인**: Notion의 CDN 이미지는 CORS 정책으로 base64 변환 불가

**현재 동작**:
- 변환 가능한 이미지는 base64로 변환됩니다
- CORS로 인해 변환 불가능한 이미지는 **원본 URL을 유지**합니다
- 결과적으로 **모든 이미지가 표시됩니다** (원본 URL 또는 base64)

**콘솔에 보이는 메시지**:
```
[Notion-PDF] Image load failed (CORS or network), keeping original URL: https://...
```
이는 **정상 동작**입니다. 이미지는 원본 URL로 표시됩니다.

**장점**:
✅ 모든 이미지가 결국 표시됨
✅ 화질 손실 없음 (원본 URL 사용)

**주의**:
⚠️ 원본 URL은 만료될 수 있음 (Notion은 signed URL 사용)
⚠️ 오프라인에서는 원본 URL 이미지는 표시되지 않음

### 3. "서버에 연결할 수 없습니다" 메시지

**원인**: 서버가 실행 중이 아니거나 잘못된 URL 설정

**해결책**:
1. 서버가 실행 중인지 확인합니다: `npm start`
2. `popup.js`의 `SERVER_URL`이 올바른지 확인합니다:
   ```javascript
   // 프로덕션
   SERVER_URL: 'https://notion-pdf.cld338.me'
   
   // 개발
   SERVER_URL: 'https://notion-pdf.cld338.me'
   ```
3. 방화벽 설정을 확인합니다
4. HTTPS 인증서 확인 (프로덕션 환경)

## 개발 가이드

### 로깅

개발자 도구에서 콘솔을 열고 다음과 같은 로그를 확인할 수 있습니다:

```javascript
// Content Script 로그
[Notion-PDF] Content script loaded on https://www.notion.so/...
[Notion-PDF] Starting page capture...
[Notion-PDF] Converting images to base64...

// Popup 로그
[Notion-PDF] Server URL: https://notion-pdf.cld338.me
[Notion-PDF] Capture request received
```

### 디버깅

1. **Content Script 오류**: F12 아이콘 > 확장 프로그램 콘솔
2. **Popup 오류**: F12에서 popup.html 콘솔
3. **Network 분석**: F12 > Network 탭에서 요청 확인

### 로컬 개발 서버 실행

```bash
# 프로젝트 루트에서
npm start

# 포트 3000이 아닌 다른 포트에서 실행하는 경우
# popup.js의 CONFIG.SERVER_URL을 수정하세요
```

## 성능 최적화

### 이미지 크기 최적화

현재 구현은 모든 이미지를 base64로 변환합니다. 매우 큰 페이지의 경우:

1. 이미지 압축 품질 조정 (content.js):
```javascript
img.src = canvas.toDataURL('image/png', 0.8); // 0.8 = 80% 품질
```

2. 이미지 크기 제한 추가 (작은 이미지만 변환 등)

### 대용량 데이터 처리

50MB 이상의 데이터는 다음 방식을 고려하세요:
1. 청크 단위로 분할 전송
2. 이미지를 별도로 업로드
3. 서버에서 캐싱 설정

## 보안 고려사항

- ✅ 스크립트 및 iframe 자동 제거
- ✅ 이벤트 핸들러 정제
- ✅ HTML 크기 제한 (10MB)
- ✅ 세션 TTL 설정 (1시간)
- ✅ Rate Limiting 적용

## TODO / 향후 계획

- [ ] Firefox 지원
- [ ] 확장 프로그램 개인화 설정 페이지
- [ ] 이미지 압축 옵션
- [ ] 페이지 미리보기
- [ ] 클라우드 저장소 통합
- [ ] 배치 변환 지원

## 피드백 및 버그 보고

문제가 발생하거나 기능 요청이 있으신 경우:
1. GitHub Issues에 보고해주세요
2. 또는 [support email]로 연락주세요

## 라이선스

MIT License - 자유롭게 사용 및 수정 가능합니다.

---

**마지막 업데이트**: 2026-03-17
**버전**: 0.1.0 (MVP)
