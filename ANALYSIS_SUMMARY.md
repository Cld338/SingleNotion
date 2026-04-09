# 분석 결과 요약

## 🔍 발견: 캐시 vs URL 렌더링 결과 차이의 원인

동일한 노션 문서에서 렌더링 결과가 다른 이유를 분석했습니다.

---

## 🚨 **근본 원인 (3가지, 우선순위 순)**

### 1️⃣ CSS 리소스 처리 불일치 (가장 가능성 높음)

**문제:**
- Extension에서 캡처한 HTML의 CSS는 원본 그대로 유지됨 (url() 경로 변환 X)
- `/render-cache` 엔드포인트도 `convertAllToProxyAsset()` 호출하지 않음
- `<base href>` 태그만 주입하지만, **CSS url() 내부의 경로는 처리하지 못함**

**예시:**
```css
/* CSS 내부의 상대 경로 */
.bg { background-image: url("./images/bg.png"); }  /* 변환 안 됨 */
.mask { mask: url("/icons/mask.svg"); }            /* 변환 안 됨 */

<!-- <base href>만 주입되지만, 위 url()은 처리 안 됨 -->
```

**결과:**
- 배경 이미지 누락
- SVG 마스크 표시 안 됨
- 아이콘/그라데이션 미표시
- **레이아웃 변형** (텍스트 줄바꿈 달라짐)

**코드 위치:** `src/routes/pdf.js` line 600~655 (`/render-cache` 엔드포인트)

---

### 2️⃣ Puppeteer Request Handler 필터 정책 차이

**문제:**
- **URL 렌더링**: localhost 요청 모두 차단
- **캐시 렌더링**: localhost 요청 허용

```javascript
// URL 렌더링 (usesCachedData=false)
if (isLocal && !isRenderCacheEndpoint) {
    return request.abort();  // ❌ localhost 차단!
}

// 캐시 렌더링 (usesCachedData=true)
if (isLocal && !isRenderCacheEndpoint) {
    return request.abort();  // ✅ /render-cache 제외 → localhost 허용
}
```

**결과:**
- 일부 리소스 로드 실패
- 동적 CSS 미적용

**코드 위치:** `src/services/pdfService.js` line 1306~1325 (`_setupBrowserPage`)

---

### 3️⃣ 이미지 로드 방식 차이 (3순위)

- **캐시**: data URI 또는 절대 URL
- **URL**: 실시간 네트워크 요청 (Notion 이미지 토큰 재검증)
- 토큰 만료 시 401 에러 발생 가능

---

## ✅ 권장 해결 방법

### **즉시 적용 방법: /render-cache에서 CSS url() 변환 활성화**

**파일:** `src/routes/pdf.js`, line 600~655

**변경 전:**
```javascript
let processedHtml = html;

// [CRITICAL FIX] URL 변환을 하지 않음 (원본 그대로 반환)
// ...

res.type('text/html').send(processedHtml);  // ❌ CSS 변환 안 됨
```

**변경 후:**
```javascript
let processedHtml = html;

// ✅ CSS url() 경로를 proxy-asset으로 변환 (필수!)
if (baseUrl) {
    // CSS 내부의 background-image, mask, border-image 등의 url() 변환
    processedHtml = processedHtml.replace(
        /url\(\s*['"]?(?!(?:\/proxy-asset|data:))([^)'"]+)['"]?\s*\)/gi,
        (match, urlPath) => {
            urlPath = urlPath.trim();
            if (urlPath.includes('/proxy-asset') || urlPath.startsWith('data:')) {
                return match;
            }
            
            const absolutePath = urlPath.startsWith('http') 
                ? urlPath 
                : new URL(urlPath, baseUrl).href;
            
            const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
            return `url('${proxiedUrl}')`;
        }
    );
}

res.type('text/html').send(processedHtml);  // ✅ CSS 변환됨
```

---

## 🧪 검증 방법

변경 후 확인 사항:

1. **캐시 렌더링 스크린샷** vs **URL 렌더링 스크린샷** 비교
   - 배경 이미지 표시 여부
   - 아이콘/마스크 표시 여부
   - 레이아웃 일치 여부

2. **브라우저 개발자 도구**
   - Network 탭에서 CSS url() 리소스 로드 여부 확인
   - Console에서 CORS/404 에러 확인

3. **PDF 생성 로그**
   ```bash
   # 로그에서 리소스 로드 성공 여부 확인
   grep -i "proxy-asset\|css\|image\|404\|fail" logs/*.log
   ```

---

## 📝 추가 권장사항

### Extension 개선 (부차적)
`extension/content.js`에서 CSS 경로 변환 추가:
```javascript
// CSS 내부 url() 경로를 절대 경로로 변환
document.querySelectorAll('style').forEach((style) => {
    const converted = style.textContent.replace(
        /url\(\s*['"]?([^)'"]+)['"]?\s*\)/gi,
        (match, path) => {
            if (path.startsWith('http') || path.startsWith('data:')) return match;
            const absolute = resolveRelativePath(path);
            return match.replace(path, absolute);
        }
    );
    style.textContent = converted;
});
```

---

## 결론

**원인:** CSS 리소스 처리 방식 불일치로 인한 박스 모델/스타일 차이

**해결:** `/render-cache` 엔드포인트에서 CSS url() 경로를 proxy-asset으로 변환

**예상 효과:** 캐시 렌더링과 URL 렌더링의 PDF 결과를 일치시킴

---

*자세한 분석은 [CACHE_RENDERING_ISSUE_ANALYSIS.md](./CACHE_RENDERING_ISSUE_ANALYSIS.md) 참고*
