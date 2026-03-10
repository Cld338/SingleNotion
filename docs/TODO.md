SingleNotion 표준 규격 및 페이지 분할 기능 구현 계획

1. 프론트엔드 진입점 개편 (public/index.html)

목표: 사용자가 문서를 변환할 모드와 규격을 선택할 수 있는 UI 제공

UI 추가:

출력 모드 선택: 라디오 버튼으로 단일 페이지(Single Page)와 표준 규격(Standard Format) 선택.

표준 규격 옵션: 표준 규격 선택 시 하위 셀렉트 박스 표시 (A4, A3, B5, Letter 등).

라우팅 분기:

Form onSubmit 이벤트 수정.

단일 페이지 선택 시: 기존대로 edit.html?url={url}로 이동.

표준 규격 선택 시: 신규 페이지인 standard-edit.html?url={url}&format={format}으로 이동.

2. 편집기용 노션 HTML 프리뷰 API 신규 추가 (src/routes/pdf.js, src/services/pdfService.js)

목표: standard-edit.html에서 Iframe처럼 노션 화면을 보여주기 위해, 렌더링된 HTML을 반환하는 API 구현

API 엔드포인트 추가: /api/pdf/preview-html (GET 또는 POST)

동작 로직 (pdfService.js에 getPreviewHtml 메서드 추가):

Puppeteer를 이용해 요청받은 Notion URL 접속.

네트워크 요청 및 렌더링이 완료될 때까지 대기 (기존 waitForNetworkIdle 등 활용).

page.content()를 호출하여 완전히 렌더링된 DOM(HTML) 구조 추출.

프론트엔드에 이 HTML 문자열을 반환.

3. 표준 규격 편집 페이지 신규 개발 (public/standard-edit.html, public/standard-edit.js)

목표: 렌더링된 HTML을 화면에 띄우고, 사용자가 클릭하여 페이지 분할선(Page Break)을 삽입/해제하는 에디터 구현

화면 레이아웃: * 좌측/메인 영역: 노션 문서 미리보기 및 분할 작업 영역.

우측/상단: 제어 패널 ('미리보기 생성' 버튼, 현재 규격 표시 등).

구현 로직:

HTML 로드: 페이지 로드 시 /api/pdf/preview-html API를 호출하여 받아온 HTML을 메인 영역(div#notion-container)에 삽입. (이때 스크롤 등 CSS 조정 필요)

분할선 UI (Hover & Click):

이벤트 위임(Event Delegation)을 사용하여 노션의 최상위 블록 요소(div.notion-block-... 등)에 마우스 Hover 시 점선 가이드라인 표시.

클릭 시 해당 요소에 data-page-break="true" 속성 부여 및 시각적으로 굵은 절취선 UI 삽입.

데이터 추출: 'PDF 변환' 버튼 클릭 시, data-page-break="true"가 적용된 요소들의 식별자(ID 또는 특정 data-block-id 등)를 수집하여 배열(pageBreaks)로 생성.

작업 큐(Queue) 요청: url, format, pageBreaks 배열을 Payload로 담아 기존 /api/pdf/generate API 호출.

4. 백엔드 PDF 생성 로직 확장 (src/services/pdfService.js, src/worker.js)

목표: 수신된 format 및 pageBreaks 데이터를 바탕으로 분할된 다중 페이지 PDF를 생성

파라미터 확장:

워커에서 넘겨받는 job.data에 mode, format, pageBreaks 속성 추가 반영.

분할(Page Break) CSS 동적 주입:

Puppeteer가 페이지 로딩을 마친 후 PDF를 찍기 직전에 page.evaluate() 실행.

전달받은 pageBreaks 식별자 배열을 순회하며 해당 DOM 요소를 찾음.

찾은 DOM 요소의 스타일에 element.style.pageBreakBefore = 'always'; 적용.

Puppeteer PDF 옵션 분기 처리:

const pdfOptions = {
    printBackground: true,
    // ... 기존 공통 옵션
};

if (jobData.mode === 'standard') {
    // [신규] 표준 규격 모드
    pdfOptions.format = jobData.format; // 예: 'A4'
    pdfOptions.margin = { top: '1cm', bottom: '1cm', left: '1cm', right: '1cm' }; 
    // pageRanges 옵션 생략 (전체 페이지 출력)
} else {
    // [기존] 단일 페이지 모드
    pdfOptions.width = `${bodyWidth}px`;
    pdfOptions.height = `${bodyHeight}px`;
    pdfOptions.pageRanges = '1';
}

await page.pdf(pdfOptions);
