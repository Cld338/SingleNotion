# 시스템 아키텍처 개요 (Architecture Overview)

SingleNotion은 노션 페이지를 PDF로 변환하는 과정에서 발생할 수 있는 긴 대기 시간과 서버 리소스 초과 현상을 방지하기 위해 비동기 작업 큐(Queue) 기반의 아키텍처를 채택하고 있습니다.

## 1. 디렉토리 구조 및 계층 분리

단일 책임 원칙(SRP)에 따라 시스템은 다음과 같이 독립적인 모듈로 분리되어 관리됩니다.

- **`src/app.js`**: 애플리케이션 진입점. 미들웨어 설정, 정적 파일 서빙 및 전역 라우터 등록을 담당합니다.
- **`src/config/`**: 인프라 및 외부 연동 설정. (예: `queue.js` - Redis 및 BullMQ 연결 설정)
- **`src/routes/`**: API 엔드포인트 정의 및 요청 유효성 검사. (예: `pdf.js` - 변환 요청, 상태 조회, 다운로드 라우팅)
- **`src/services/`**: 핵심 비즈니스 로직. (예: `pdfService.js` - Puppeteer 제어 및 PDF 생성)
- **`src/jobs/`**: 백그라운드 스케줄러. (예: `cleanup.js` - 오래된 임시 파일 삭제)
- **`src/worker.js`**: 비동기 작업 큐를 구독하며 백그라운드에서 실제 변환 작업을 수행하는 프로세스.
- **`src/utils/`**: 브라우저 인스턴스 풀(`browserPool.js`), 로거, 스토리지 등 공통 유틸리티 기능.

## 2. 핵심 컴포넌트

### 1) Web Server (Express)
- 클라이언트의 변환 요청을 수신하고 유효성을 검사합니다.
- 요청을 작업 큐(Redis)에 적재하고 Job ID를 반환합니다.
- SSE(Server-Sent Events)를 통해 클라이언트에게 작업 진행 상태를 실시간으로 전달합니다.

### 2) Message Queue (BullMQ + Redis)
- 변환 작업 목록을 안전하게 보관하고 관리합니다.
- 동시 접속자가 많아도 서버가 다운되지 않도록 작업을 순차적으로 Worker에 할당합니다.

### 3) Worker Process
- 큐에서 대기 중인 작업을 꺼내어(Consume) `pdfService`를 통해 실제 PDF 생성을 수행합니다.
- `generic-pool`을 활용하여 Puppeteer 브라우저 인스턴스를 풀(Pool) 형태로 관리하며, 격리된 환경에서 작업을 수행하여 메모리 누수 및 프로세스 크래시에 대응합니다.
- 작업의 성공, 실패, 진행률 상태를 큐에 업데이트합니다.

## 3. 데이터 및 제어 흐름
1. **[Client]** 웹 UI에서 변환할 URL과 옵션을 선택하여 전송.
2. **[API Server]** 요청을 파싱하여 BullMQ에 Job 추가 후 클라이언트에게 `jobId` 반환 (202 Accepted).
3. **[Client]** 반환받은 `jobId`를 이용해 서버에 SSE(Server-Sent Events) 연결(`/job-events/:id`)을 맺음.
4. **[Worker]** 큐에서 Job을 획득하고, `browserPool`에서 가용한 Puppeteer 브라우저 인스턴스를 대여(Acquire)하여 PDF 스트림 렌더링 수행.
5. **[Worker]** 생성된 PDF 스트림(Stream)을 로컬 디렉토리(`/public/downloads`)에 파이핑하여 저장 후, 브라우저 인스턴스를 풀에 반납(Release)하고 Job 상태를 'completed'로 업데이트.
6. **[Client]** 폴링 결과가 'completed'일 경우, 반환된 다운로드 URL(`/downloads/...`)을 호출하여 파일 다운로드 수행.