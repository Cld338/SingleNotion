# "콘텐츠 스크립트 오류" - 문제 해결 가이드

## 오류 메시지

```
✕ 콘텐츠 스크립트 오류
```

또는 상세 메시지:
```
콘텐츠 스크립트가 로드되지 않았습니다. 페이지를 새로고침하세요.
페이지에서 응답이 없습니다. 페이지를 새로고침하세요.
```

---

## 원인

콘텐츠 스크립트가 Notion 페이지에 제대로 로드되지 않았거나, 확장 프로그램과 페이지 간의 통신이 실패한 경우입니다.

### 가능한 원인들

1. **페이지가 완전히 로드되지 않음** → 가장 흔한 원인
2. **확장 프로그램이 최신 버전이 아님** → 콘텐츠 스크립트 오래됨
3. **특수한 Notion 페이지** → 로그인 페이지, 휴지통 등
4. **브라우저 캐시 문제** → 오래된 콘텐츠 스크립트
5. **권한 문제** → 확장 프로그램 권한 불충분

---

## 해결 방법

### 단계 1: 페이지 새로고침 (가장 먼저 시도)

**Notion 페이지에서**:
```
Ctrl+R (Windows) 또는 Cmd+R (Mac)
또는 F5
```

**완전히 캐시 비우고 새로고침**:
```
Ctrl+Shift+R (Windows) 또는 Cmd+Shift+R (Mac)
```

**결과**: 대부분의 경우 이것으로 해결됩니다! ✅

---

### 단계 2: 확장 프로그램 다시 로드

1. 주소창에 입력: `chrome://extensions`
2. "Notion to PDF - Direct Convert" 찾기
3. 우측 하단의 **"새로고침"** 아이콘 클릭
4. Notion 페이지로 돌아가기
5. 다시 시도

---

### 단계 3: 올바른 페이지인지 확인

**확장 프로그램이 작동하는 페이지**:
- `https://www.notion.so/...` ✅
- `https://cloudier338.notion.site/...` ✅
- `https://yourname.notion.site/...` ✅

**작동하지 않는 페이지**:
- `https://www.notion.so/login` ❌ (로그인 페이지)
- `https://www.notion.so/trash` ❌ (휴지통)
- Notion 테ンプレ 선택 페이지 ❌

**올바른 Notion 문서 페이지로 이동해야 합니다.**

---

### 단계 4: 개발자 도구에서 콘솔 확인

1. Notion 페이지에서 **F12** 누르기
2. **Console** 탭으로 이동
3. 다음을 확인:

```javascript
// 이 로그가 보이는지 확인:
[Notion-PDF] Content script loaded on https://www.notion.so/...

// 이 로그가 보이면 콘텐츠 스크립트가 정상 로드됨 ✅
```

**만약 안 보이면**:
- 페이지를 새로고침
- 확장 프로그램을 다시 로드
- 다른 Notion 페이지로 이동해보기

---

### 단계 5: 캐시 완전히 비우기

#### Chrome:
```
1. ⋯ (메뉴) > 더보기 도구 > 인터넷 사용 기록 삭제
2. "시간 범위": 전체 시간
3. "쿠키 및 기타 사이트 데이터" 체크 ✅
4. "인터넷 사용 기록" 체크 ✅
5. 삭제 클릭
6. Chrome 재시작
```

#### Edge:
```
1. ⋯ (메뉴) > 설정 > 개인 정보
2. "인터넷 사용 기록 선택" 클릭
3. 찾아보기 데이터 삭제
```

---

### 단계 6: 확장 프로그램 재설치

**완전히 제거 후 다시 설치**:

1. `chrome://extensions`
2. "Notion to PDF" 찾기
3. **"제거"** 버튼 클릭
4. 경고 확인

```bash
# 터미널에서
# extension 폴더 위치 확인
# Windows: c:\workspace\notion-pdf\SinglePagedNotionPDF\extension
```

5. "**확장 프로그램 압축 풀기**" 버튼 클릭
6. `extension` 폴더 선택하여 로드
7. Notion 페이지에서 다시 시도

---

## 고급 디버깅

### 콘솔에서 상세 로그 확인

Notion 페이지에서 F12를 누르고 콘솔에 입력:

```javascript
// 모든 Notion PDF 로그 필터링
filter: [Notion-PDF]

// 또는 직접 확인
chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
  console.log('Current tab:', tabs[0]);
  console.log('Tab URL:', tabs[0].url);
});
```

### 확장 프로그램 오류 확인

1. `chrome://extensions`
2. "Notion to PDF" 오른쪽 아래 "오류" 확인
3. 오류 메시지 클릭해서 상세 내용 보기

---

## 일반적인 오류 메시지와 해결책

| 오류 | 원인 | 해결책 |
|------|------|--------|
| "Could not establish connection" | 콘텐츠 스크립트 미로드 | 페이지 새로고침 |
| "Receiving end does not exist" | 탭이 특수 페이지 | 일반 Notion 페이지로 이동 |
| "Invalid tab or frame" | 확장이 접근 불가 | 확장 재설치 |
| "Extension context invalidated" | 확장 업데이트됨 | 브라우저 재시작 |

---

## 작동 확인 체크리스트

다음을 모두 확인했으면 정상입니다:

- [ ] Notion 페이지 URL이 `notion.so` 또는 `notion.site` 포함
- [ ] 페이지가 완전히 로드됨
- [ ] 개발자 도구 콘솔에 `[Notion-PDF] Content script loaded` 보임
- [ ] 확장이 `chrome://extensions`에서 활성화됨
- [ ] 다른 Notion 페이지에서도 시도해봤음

---

## 여전히 안 되면?

### 최후의 수단

```bash
# 1. 모든 브라우저 창 닫기
# 2. Chrome 완전 재시작
# 3. 확장 재로드

chrome://extensions
# Notion to PDF > 새로고침

# 4. 새로운 Notion 페이지에서 시도
```

### 시스템 체크

```bash
# Windows PowerShell:
Get-ChildItem "C:\Users\$env:USERNAME\AppData\Local\Google\Chrome\User Data\Default\Extensions"

# Mac Terminal:
ls ~/Library/Application\ Support/Google/Chrome/Default/Extensions/
```

---

## 도움이 필요한 경우

1. **콘솔 로그 스크린샷** 캡처
2. **오류 메시지 전체** 기록
3. **사용 중인 Notion URL** 확인 (로그인 정보 제외)
4. **브라우저 버전** 확인: Chrome 메뉴 > 도움말 > Chrome 정보

---

**Last Updated**: 2026-03-17
**Version**: 0.1.0
**Status**: 콘텐츠 스크립트 오류 진단 및 해결 가이드
