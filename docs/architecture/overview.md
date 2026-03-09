# 시스템 아키텍처 개요 (Architecture Overview)

## 1. 계층형 구조 및 보안 레이어

본 시스템은 Express 기반의 웹 계층과 BullMQ 기반의 작업 계층으로 분리되어 있으며, 안정성을 위해 다음과 같은 미들웨어 레이어를 포함합니다.

- **보안 레이어 (Helmet & CORS)**:  `helmet` 을 통해 기본적인 보안 헤더를 설정하고,  `cors` 를 통해 교차 출처 리소스 공유를 관리합니다.

- **검증 레이어 (Joi)**: 모든 API 요청 데이터(Body, Query)는  `src/routes/pdf.js` 에 정의된 Joi 스키마를 통해 엄격하게 유효성을 검사합니다.

- **처리율 제한 (Rate Limit)**:  `/convert-url`  엔드포인트는 악의적인 요청 방지를 위해 IP당 요청 횟수를 제한합니다.

## 2. 데이터 및 리소스 생명주기

1. **요청 수용**: 클라이언트 요청이 들어오면 Job ID를 생성하고 Redis에 작업을 적재합니다.

1. **작업 수행**: Worker가  `browserPool` 에서 브라우저를 대여하여 PDF를 생성합니다.

1. **결과물 저장**: 생성된 PDF는  `/public/downloads` 에 일시 저장됩니다.

1. 
**다운로드 및 파기**:

  - 사용자가  `/download/:filename` 을 호출하여 다운로드가 성공하면, 서버는 보안과 용량 관리를 위해  `fs.unlink` 를 사용하여 파일을 즉시 삭제합니다.

  - 다운로드되지 않은 잔여 파일은  `src/jobs/cleanup.js`  스케줄러에 의해 1시간마다 자동 정리됩니다.

## 3. 주요 모듈 설명

- `src/utils/browserPool.js` :  `generic-pool` 을 사용하여 Puppeteer 인스턴스를 재사용함으로써 매 요청마다 브라우저를 띄우는 오버헤드를 줄이고 메모리 누수를 방지합니다.

- `src/routes/admin.js` :  `Bull Board` 를 연동하여 작업 큐의 상태를 시각화하며, Basic Auth를 통해 인가된 사용자만 접근을 허용합니다.