# SingleNotion

노션 문서를 한 페이지의 PDF로 변환하는 웹 서비스입니다.

## 주요 기능
- **단일 페이지 변환**: 긴 노션 페이지를 끊김 없는 한 장의 PDF로 변환
- **맞춤형 옵션**: 노션 헤더(커버/아이콘), 제목, 페이지 속성(태그) 표시 여부 선택 가능
- **비동기 처리**: 작업 큐를 통한 안정적인 다중 요청 처리
- **리소스 최적화**: 브라우저 인스턴스 풀링을 통한 안정적인 메모리 관리

## 기술 스택
- **Backend & Queue**: Node.js (Express), BullMQ, Redis
- **Rendering & Resource Management**: Puppeteer (Headless Chrome), generic-pool

## 퀵 스타트

```bash
# 1. 저장소 클론
git clone <https://github.com/Cld338/SingleNotion>
cd SingleNotion

# 2. Docker Compose로 실행
docker-compose up -d --build

# 3. 접속
https://notion-pdf.cld338.me
```


## 테스트 실행
```bash
# 테스트 실행
npm test
```

## 환경 변수 (Environment Variables)
- `ADMIN_USERNAME`: 대시보드 접근 관리자 아이디 (필수)
- `ADMIN_PASSWORD`: 대시보드 접근 관리자 비밀번호 (필수)
- `BULL_BOARD_PATH`: 대시보드 마운트 경로 (기본값: `/admin/queues`)