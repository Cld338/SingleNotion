# 캐시 vs URL 렌더링 결과 차이 분석 보고서

## 문제 정의
동일한 노션 문서에 대해:
- **캐시 렌더링**: Extension이 캡처한 데이터로 PDF 생성 (via `/render-cache`)
- **URL 렌더링**: 직접 Notion URL에서 PDF 생성
- 결과가 **다르게 나옴**

---

## 렌더링 아키텍처 이해

### 캐시 렌더링 플로우
```
1. Extension (content.js)
   ├─ DOM에서 모든 경로를 절대 경로로 변환 (proxy-asset 변환 X)
   ├─ 이미지를 data URI로 변환 시도 (실패 시 절대 URL 유지)
   ├─ CSS/JS는 원본 그대로 유지
   └─ capturePageContent() → popup.js로 전달

2. Popup (popup.js)
   └─ /render-from-extension POST → Redis 저장

3. Backend (/render-from-extension)
   ├─ ExtensionSession 생성 (24h TTL)
   ├─ HTML + 리소스 정보 저장
   └─ sessionId 반환

4. PDF 생성 시 (pdfService.generatePdf)
   ├─ _setupBrowserPage(page, usesCachedData=true)
   ├─ _navigateToPage → localhost:3000/render-cache/{sessionId}
   └─ /render-cache 엔드포인트에서 HTML 제공

5. /render-cache 엔드포인트
   ├─ Redis에서 캐시된 HTML 조회
   ├─ tracking 스크립트 필터링 (정규식)
   ├─ <base href> 태그만 주입
   ├─ [CRITICAL] convertAllToProxyAsset() 호출 안 함 ⚠️
   └─ 원본 HTML 그대로 반환
```

### URL 직접 렌더링 플로우
```
1. useFeature.generatePdf(url, options, null)
   ├─ _setupBrowserPage(page, usesCachedData=false)
   ├─ _navigateToPage → 직접 Notion URL로 이동
   └─ Puppeteer가 실시간 렌더링
```

---

## 발견된 주요 차이점

### 1️⃣ Request Interception/리소스 필터 정책

**캐시 렌더링** (`_setupBrowserPage`, `usesCachedData=true`):
```javascript
const isRenderCacheEndpoint = usesCachedData && reqUrl.includes('/render-cache/') && reqUrl.includes('http');

// 메인 프레임: 노션 도메인 또는 render-cache 엔드포인트 허용
if (isMainFrame) {
    const isNotionDomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?(notion\.so|notion\.site)/.test(reqUrl);
    if (!isNotionDomain && !isRenderCacheEndpoint) {
        return request.abort();
    }
}

// ✅ render-cache 엔드포인트 제외 → localhost 요청 통과 가능!
const isLocal = /^(http|https):\/\/(localhost|127\.|...)/.test(reqUrl);
if (isLocal && !isRenderCacheEndpoint) {
    return request.abort();
}
```

**URL 렌더링** (`usesCachedData=false`):
```javascript
// localhost 요청 모두 차단
const isLocal = /^(http|https):\/\/(localhost|127\.|...)/.test(reqUrl);
if (isLocal) {
    return request.abort();  // ❌ localhost 차단!
}
```

**문제점**: 
- ❌ URL 렌더링 시 localhost 요청이 모두 차단됨
- ✅ 캐시 렌더링 시 localhost는 통과 가능

### 2️⃣ CSS 리소스 로딩 중대 차이

#### /render-cache 엔드포인트 구현
```javascript
// ✅ [CRITICAL FIX] URL 변환을 하지 않음 (원본 그대로 반환)
// 이유:
//   1. Extension에서 캡처한 HTML은 이미 절대 URL을 포함하고 있음
//   2. convertAllToProxyAsset()은 렌더링을 변경할 수 있음
//   3. Puppeteer의 request handler에서 원본 URL을 직접 처리하는 것이 더 안정적
//   4. /preview-html과 렌더링 결과를 일치시키기 위해 HTML을 최소한으로만 처리

let processedHtml = html;

// [Step 1] 불필요한 추적 스크립트 필터링만 수행
processedHtml = processedHtml.replace(
    /<script\s+[^>]*src=['"](https?:\/\/[^'"]*(?:analytics|tracking|doubleclick|google-analytics)[^'"]*)['"]\s*(?:>\s*<\/script>)?/gi,
    '<!-- tracking script removed -->'
);

// [Step 2] Base 태그 추가 (상대 경로 처리용 폴백)
if (baseUrl && processedHtml) {
    const baseTag = `<base href="${baseUrl}">`;
    processedHtml = processedHtml.replace(/<head[^>]*>/i, (match) => {
        return match + '\n' + baseTag;
    });
}

// [Step 3] HTML을 puppeteer에서 로드 가능한 형태로 반환
res.type('text/html').send(processedHtml);
```

**문제점**:
- ❌ `convertAllToProxyAsset()` 호출 안 함
- ❌ CSS 내부의 `url()` 경로가 그대로 유지됨
- ❌ `<base href>` 만으로는 CSS 내부의 상대 경로를 제대로 해석하지 못할 수 있음

#### 예시 시나리오

```html
<!-- Extension 캡처 결과 -->
<style>
  .background { background-image: url("./images/bg.png"); }
  .icon { mask: url("/icons/mask.svg"); }
</style>

<!-- /render-cache 엔드포인트-->
<base href="https://notion.so/my-page">
<!-- 위의 style 그대로 반환 -->

<!-- Puppeteer 렌더링 시 어떤 일이? -->
<!-- ./images/bg.png → https://notion.so/my-page/images/bg.png ? (상대 경로 해석) -->
<!-- /icons/mask.svg → /icons/mask.svg (절대 경로 유지) -->
<!-- 실제로는 base href가 CSS url()을 처리하지 못함! -->
```

### 3️⃣ 네비게이션 타이밍 & 리소스 로딩 차이

**캐시 렌더링** (_navigateToPage):
```javascript
// 로컬 render-cache 엔드포인트 사용
navigationUrl = `http://127.0.0.1:3000/render-cache/${sessionId}`;

// 1. 초기 로드: domcontentloaded (HTML/CSS/JS만 로드, 이미지/폰트 차단)
await page.goto(navigationUrl, { waitUntil: 'domcontentloaded' });

// 2. Request handler 변경: 모든 리소스 로드 허용
page.removeAllListeners('request');
page.on('request', request => {
    request.continue();  // ✅ 모든 요청 허용
});

// 3. 백그라운드 리소스 로드 시간 확보
await new Promise(resolve => setTimeout(resolve, 2000));
```

**URL 렌더링** (_navigateToPage):
```javascript
// 직접 Notion URL로 이동
navigationUrl = url;

// 1. 초기 로드: domcontentloaded
await page.goto(navigationUrl, { waitUntil: 'domcontentloaded' });

// 2. localhost 요청 필터 때문에...
// ... CSS 내부의 relative URL이 localhost로 해석되면 차단될 수 있음
```

**차이점**:
- 캐시: localhost 요청이 모두 허용되므로 CSS 리소스 로드 문제 없음
- URL: localhost 요청이 차단되므로 상대 경로 해석 시 문제 발생 가능

---

## 근본 원인 (순서별 가능성)

### 🔴 **1순위: CSS 리소스 처리 불일치**

**문제**:
- Extension은 CSS의 `url()` 경로를 **절대 경로로 변환하지 않음**
- `/render-cache` 엔드포인트도 **`convertAllToProxyAsset()` 호출 안 함**
- `<base href>` 주입만으로는 CSS url() 내부의 상대 경로를 처리하지 못함
- 결과: 일부 CSS 리소스 로드 실패 → 스타일 렌더링 차이

**예상 증상**:
- 배경 이미지 누락
- 아이콘/마스크 표시 안 됨
- 폰트 스타일 적용 안 됨
- 그라데이션/패턴 표시 안 됨

---

### 🟡 **2순위: Puppeteer Request Handler의 localhost 필터**

**문제**:
- URL 렌더링: localhost 요청 모두 차단 (line ~1320)
- 캐시 렌더링: localhost/render-cache 요청만 허용 (line ~1309-1311)
- 상대 경로가 localhost로 해석되면 차단됨

**예상 증상**:
- CSS 리소스 로드 실패
- 폰트 파일 로드 실패
- 동적 스타일 무효화

---

### 🟢 **3순위: 이미지 처리 방식 차이**

**문제**:
- 캐시: data URI 이미지 또는 절대 URL (auth token 포함)
- URL: 실시간 네트워크 요청 → 인증 토큰 재검증
- Notion 이미지 URL의 만료 가능성

**예상 증상**:
- 일부 이미지 로드 실패 (401/403)
- 시간 차이로 인한 토큰 만료

---

## 권장 해결 방안

### ✅ **즉시 적용 가능한 수정**

#### 1. `/render-cache` 엔드포인트에서 CSS url() 경로 변환 활성화

**현재 코드** (`src/routes/pdf.js`, line 600~650):
```javascript
// [CRITICAL FIX] URL 변환을 하지 않음 (원본 그대로 반환)
let processedHtml = html;
```

**개선 방안**:
```javascript
// CSS 내부의 url() 경로를 proxy-asset으로 변환해야 함
// (배경 이미지, 마스크, 폰트 등)
let processedHtml = html;

// ✅ CSS url() 경로를 proxy-asset으로 변환
// 이유: Extension에서 CSS는 원본 그대로 전달되고, 
//      CSS 내부의 상대 경로는 <base href>로 처리되지 않음
if (baseUrl) {
    processedHtml = pdfService.convertCssUrlsToProxyAsset(processedHtml);
}

// 또는 URLPathConverter.convertAllToProxyAsset() 호출
// processedHtml = URLPathConverter.convertAllToProxyAsset(processedHtml, baseUrl);
```

---

#### 2. Extension의 CSS 경로 변환 단계 추가

**현재 코드** (`extension/content.js`, line ~900):
```javascript
// ⚠️ style 속성 처리는 제거!
// 이유: style 속성 내의 따옴표 처리가 복잡하고...
console.log('[Notion-PDF-DEBUG] Style attribute processing skipped (handled by server)');
```

**개선 방안**:
```javascript
// CSS 텍스트의 url() 경로를 절대 경로로 변환
document.querySelectorAll('style').forEach((style) => {
    const originalContent = style.textContent;
    // CSS 내부 url() 경로를 절대 경로로 변환
    const convertedContent = convertCssUrlsToAbsolute(originalContent);
    // 실시간 스타일 적용
    style.textContent = convertedContent;
});
```

---

#### 3. Puppeteer Request Handler 필터 로직 개선

**문제 코드** (`src/services/pdfService.js`, line ~1320):
```javascript
// 로컬 요청 차단 (render-cache 엔드포인트 제외)
const isLocal = /^(http|https):\/\/(localhost|127\.|...)/.test(reqUrl);
if (isLocal && !isRenderCacheEndpoint) {
    return request.abort();  // ❌ 과도한 차단
}
```

**개선 방안**:
```javascript
// 캐시 렌더링 시에는 localhost 요청을 더 관대하게 처리
if (isLocal) {
    // 캐시 렌더링이면 localhost 통과 허용
    if (usesCachedData) {
        request.continue();  // ✅ 모두 허용
        return;
    }
    // URL 렌더링이면 필터한 요청만 허용
    if (!isRenderCacheEndpoint) {
        return request.abort();
    }
}
```

---

### 📋 **검증 체크리스트**

수정 후 확인해야 할 사항:

- [ ] 캐시 렌더링에서 배경 이미지가 나타나는가?
- [ ] 아이콘/마스크가 올바르게 표시되는가?
- [ ] 폰트 스타일이 적용되는가?
- [ ] 캐시 vs URL 렌더링의 피쏠 단위 스타일이 일치하는가?
- [ ] PDF 생성 시간이 합리적인가?
- [ ] 예외/에러가 로그에 없는가?

---

## 추가 검증 방법

### 1. 렌더 결과 비교 스크린샷
```bash
# 캐시 렌더링 스크린샷
curl -X POST https://notion-pdf.cld338.me/render-from-extension \
  -d '{"html":"...", ...}' | jq -r '.sessionId' > sessionId.txt

sessionId=$(cat sessionId.txt)
# /render-cache 로 접근하여 스크린샷 캡처
```

### 2. HTTP 요청 추적
```javascript
// Puppeteer에서 요청/응답 로깅
page.on('request', req => {
    console.log('REQ:', req.url(), req.resourceType());
});
page.on('response', res => {
    console.log('RES:', res.url(), res.status());
});
```

### 3. CSS 리소스 검증
```javascript
// 문서의 모든 style 계산
const computedStyle = window.getComputedStyle(element);
console.log('background-image:', computedStyle.backgroundImage);
```

---

## 결론

캐시 vs URL 렌더링 결과의 차이는 주로:

1. **CSS 리소스 처리 방식**의 불일치 (가장 가능성 높음)
   - `/render-cache`에서 CSS url() 경로를 proxy-asset으로 변환하지 않음
   - `<base href>`만으로는 충분하지 않음

2. **Puppeteer 요청 필터 정책**의 차이 (2순위)
   - URL 렌더링에서 localhost 요청 차단
   - 상대 경로 해석 시 문제 발생

3. **이미지 로드 타이밍** (3순위)
   - 캐시 vs 실시간 네트워크의 차이

**즉시 해결 방법**: `/render-cache` 엔드포인트에서 `convertAllToProxyAsset()` 호출 추가
