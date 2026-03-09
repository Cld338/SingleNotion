# 배포 및 실행 가이드

## 1. 환경 변수 구성 ( `.env` )

시스템 구성에 필요한 모든 환경 변수 목록입니다.  `README.md` 와 동일하게 유지되어야 합니다.

| 변수명 | 필수 여부 | 기본값 | 설명 |
| --- | --- | --- | --- |
| `PORT` | 선택 | `3000` | API 서버 포트 |
| `ADMIN_USERNAME` | **필수** | - | 큐 대시보드 접근 아이디 |
| `ADMIN_PASSWORD` | **필수** | - | 큐 대시보드 접근 비밀번호 |
| `BULL_BOARD_PATH` | 선택 | `/admin/queues` | 모니터링 대시보드 경로 |
| `REDIS_HOST` | 선택 | `redis` | Redis 호스트 주소 |
| `REDIS_PORT` | 선택 | `6379` | Redis 포트 |
| `NODE_ENV` | 선택 | `production` | 실행 환경 (development/production) |
| `WORKER_CONCURRENCY` | 선택 | `2` | 워커당 동시 처리 가능한 작업 수 |

## 2. Docker 구동 시 주의사항

### 볼륨 권한 (Volume Permissions)

Host의  `./public/downloads`  디렉토리는 PDF 파일이 생성되고 삭제되는 공간입니다. Docker 컨테이너 내부의  `node`  사용자가 이 폴더에 쓰기 권한을 가질 수 있도록 Host OS에서  `chmod -R 777 ./public/downloads`  등의 조치가 필요할 수 있습니다.

### 리소스 제한

Puppeteer는 많은 메모리를 소모합니다.  `docker-compose.yml` 에서  `pdf-worker`  서비스에 메모리 제한(mem_limit)을 설정하여 시스템 전체의 안정성을 확보하는 것을 권장합니다.

## 3. 자동 정리 스케줄러

시스템은  `src/jobs/cleanup.js` 를 통해 매시간  `/public/downloads`  디렉토리를 스캔합니다. 생성된 지 1시간이 넘은 파일은 자동으로 삭제되어 디스크 고갈을 방지합니다.