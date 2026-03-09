# API Reference

## 1. PDF 변환 요청

새로운 PDF 변환 작업을 대기열에 등록합니다.

- **URL:**  `/convert-url` 

- **Method:**  `POST` 

- **Headers:**  `Content-Type: application/json` 

### Request Body

| 필드명 | 타입 | 필수 여부 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `url` | string | 필수 | - | 변환할 대상 노션 페이지 URL |
| `pageWidth` | number | 선택 | `1080` | 생성될 PDF의 가로 너비 (300~5000px) |
| `includeTitle` | boolean | 선택 | `false` | 노션 페이지 제목 포함 여부 |
| `includeBanner` | boolean | 선택 | `false` | 커버 이미지 및 아이콘 포함 여부 |
| `includeTags` | boolean | 선택 | `false` | 페이지 속성(태그 등) 포함 여부 |
| `marginTop` | number | 선택 | `0` | 상단 여백 |
| `marginBottom` | number | 선택 | `0` | 하단 여백 |
| `marginLeft` | number | 선택 | `0` | 좌측 여백 |
| `marginRight` | number | 선택 | `0` | 우측 여백 |

### Success Response (202 Accepted)

```
{ "jobId": "1", "message": "변환 대기열에 등록되었습니다." }  
```

## 2. 작업 상태 실시간 수신 (SSE)

Server-Sent Events(SSE)를 통해 등록된 변환 작업의 진행 상태를 실시간으로 스트리밍받습니다.

- **URL:**  `/job-events/:id` 

- **Method:**  `GET` 

- **Headers:**  `Accept: text/event-stream` 

### Event Data 구조

상태에 따라 다음과 같은 JSON 객체가 스트리밍됩니다.

- **진행 중**:  `{"status": "active"}`  또는  `{"status": "waiting"}` 

- **완료**:  `{"status": "completed", "result": {"downloadUrl": "...", "fileName": "..."}}` 

- **실패**:  `{"status": "failed", "error": "실패 사유"}` 

- **에러/타임아웃**:  `{"status": "error", "error": "메시지"}` 

## 3. PDF 파일 다운로드

변환이 완료된 PDF 파일을 다운로드합니다. 다운로드 완료 후 서버의 임시 파일은 즉시 삭제됩니다.

- **URL:**  `/download/:filename` 

- **Method:**  `GET` 

### URL Parameters

-  `filename` :  `/job-events/:id` 에서 반환된  `fileName` 

## 4. 기타 엔드포인트

### 큐 모니터링 대시보드

- **URL**:  `/admin/queues`  (환경 변수  `BULL_BOARD_PATH` 로 변경 가능)

- **인증**: Basic Auth (ID/PW 필수)

### 사이트맵

- **URL**:  `/sitemap.xml` 

- **설명**: 검색 엔진 최적화(SEO)를 위한 사이트 구조 정보 제공

### 개발 문서 (VitePress)

- **URL**:  `/docs` 

- **설명**: 현재 보고 계신 개발 문서의 빌드된 정적 페이지 서빙