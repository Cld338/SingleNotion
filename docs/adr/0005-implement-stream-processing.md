# ADR 0005: 메모리 최적화를 위한 Stream 기반 PDF 생성 및 저장 도입

## 1. Context (도입 배경 및 문제 상황)
기존 `Buffer` 방식은 대용량 PDF 생성 시 전체 데이터를 메모리에 적재하여 OOM 위험이 컸습니다.

## 2. Decision (결정 사항)
- Puppeteer의 `createPDFStream`을 도입하여 데이터를 청크 단위로 처리합니다.
- `storage.js`에서 `pipeline`을 통해 스트림을 직접 파일로 기록합니다.

## 3. Consequences (결과)
- 서버 메모리 점유율을 획기적으로 낮추어 안정성을 확보했습니다.
- 테스트 시에는 실제 브라우저 구동을 피하기 위해 Mocking을 적용했습니다.