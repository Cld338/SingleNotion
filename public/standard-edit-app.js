/**
 * Main Application Logic for Standard Edit Page
 */

class StandardEditApp {
    constructor() {
        // URL Parameters
        const params = new URLSearchParams(window.location.search);
        this.notionUrl = params.get('url');
        this.format = params.get('format') || 'A4';
        this.mode = params.get('mode') || 'standard';

        // DOM Elements
        this.contentArea = document.getElementById('content-area');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.generateBtn = document.getElementById('generate-btn');
        this.loadingOverlay = document.getElementById('loading-spinner');

        // State
        this.selectedBreaks = new Set();
        this.pageHeightPx = Utils.getPageHeight(this.format);
        this.contentWidthPx = 1080;
        this.viewerScale = 1;
        this.isPrinting = false; // 추가된 코드

        this.init();
    }

    async init() {
        try {
            Logger.log(`INIT Starting for URL: ${this.notionUrl}`, 'info');
            document.getElementById('format-badge').innerText = this.format;

            const response = await fetch(`/preview-html?url=${encodeURIComponent(this.notionUrl)}`);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            Logger.log('INIT Response received', 'success', {
                htmlLength: data.html?.length || 0,
                detectedWidth: data.detectedWidth,
                cssCount: data.resources?.cssLinks?.length || 0
            });

            if (!data.html) {
                throw new Error('No HTML content received from server');
            }

            const { html, detectedWidth, resources } = data;

            // 리소스 로깅
            Logger.log('로드된 리소스 정보', 'title');
            Logger.logResources(resources);

            // 뷰어 스케일 계산
            this.contentWidthPx = detectedWidth || 1080;
            const pageWidthPx = Utils.getPageWidth(this.format);
            this.viewerScale = pageWidthPx / this.contentWidthPx;

            Logger.log(`INIT Scale: ${this.viewerScale.toFixed(4)} (Page: ${pageWidthPx}px, Content: ${this.contentWidthPx}px)`, 'info');

            // 1. CSS 로드
            if (resources?.cssLinks?.length) {
                await Utils.loadCSSResources(resources.cssLinks);
            }

            // 2. 인라인 스타일 로드
            if (resources?.inlineStyles?.length) {
                Utils.loadInlineStyles(resources.inlineStyles);
            }

            // 3. DEBUG 정보 저장
            const debugInfo = {
                cssLoaded: resources?.cssLinks?.length || 0,
                stylesLoaded: resources?.inlineStyles?.length || 0,
                contentWidth: detectedWidth,
                scale: this.viewerScale,
                timestamp: new Date().toISOString(),
                url: this.notionUrl
            };
            localStorage.setItem('debug-preview-info', JSON.stringify(debugInfo));
            Logger.log('DEBUG Info saved to localStorage', 'debug', debugInfo);

            // 4. HTML 주입
            Logger.log('INIT Injecting HTML...', 'info');
            this.contentArea.innerHTML = html;
            this.loadingSpinner.style.display = 'none';
            this.contentArea.style.display = 'block';

            // 5. 상대 경로 수정
            Logger.log('INIT Fixing relative paths...', 'info');
            Utils.fixRelativePaths(this.notionUrl, this.contentArea);

            // 6. CSS 적용 대기
            Logger.log('INIT Waiting for CSS to apply...', 'info');
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    setTimeout(resolve, 800);
                });
            });

            // 7. 뷰어 스케일 적용
            Logger.log('INIT Applying viewer scale...', 'info');
            this.applyViewerScale();

            // 8. 상호작용 설정
            Logger.log('INIT Setting up interaction...', 'info');
            this.setupInteraction();

            // 9. 페이지 구분선 렌더링
            Logger.log('INIT Rendering page break lines...', 'info');
            this.renderPageBreakLines();

            // 10. DOM 상태 로깅
            Logger.logDomStatus();

            // 11. 텍스트 선택 방지
            this.contentArea.addEventListener('selectstart', (e) => e.preventDefault());
            this.contentArea.addEventListener('select', (e) => e.preventDefault());
            this.contentArea.addEventListener('dblclick', (e) => e.preventDefault());

            // 12. 이벤트 리스너 설정
            this.setupEventListeners();

            Logger.log('INIT ✓ Preview loaded successfully!', 'success');

        } catch (err) {
            Logger.error('INIT ERROR', err);
            alert('노션 내용을 불러오지 못했습니다:\n' + err.message);
            this.loadingSpinner.style.display = 'none';
        }
    }

    applyViewerScale() {
        if (this.contentArea) {
            this.contentArea.style.transform = `scale(${this.viewerScale})`;
            this.contentArea.style.transformOrigin = 'top center';
            this.contentArea.style.width = `${this.contentWidthPx}px`;
            Logger.success(`Scale applied: ${this.viewerScale.toFixed(2)}, Width: ${this.contentWidthPx}px`);
        }
    }

    renderPageBreakLines() {

        if (this.isPrinting) return; // 추가된 코드: 인쇄 중 렌더링 차단
        // 기존 라인 제거
        document.querySelectorAll('.page-break-line').forEach(line => line.remove());
        document.querySelectorAll('.page-number-label').forEach(label => label.remove());

        const contentHeight = this.contentArea.scrollHeight;
        const scaledPageHeight = this.pageHeightPx * this.viewerScale;

        for (let pageNum = 1; pageNum * scaledPageHeight < contentHeight; pageNum++) {
            const lineTop = pageNum * scaledPageHeight;
            const line = document.createElement('div');
            line.className = 'page-break-line';
            line.style.position = 'absolute';
            line.style.top = lineTop + 'px';
            line.style.left = '0';
            line.style.right = '0';
            line.style.width = '100%';
            line.style.height = '2px';
            line.style.background = 'linear-gradient(90deg, transparent 0%, #6366f1 10%, #6366f1 90%, transparent 100%)';
            line.style.pointerEvents = 'none';
            line.style.opacity = '0.4';
            line.style.zIndex = '5';
            line.title = `페이지 ${pageNum + 1} 시작`;
            this.contentArea.appendChild(line);

            // 페이지 번호 라벨 추가
            const label = document.createElement('div');
            label.className = 'page-number-label';
            label.style.position = 'absolute';
            label.style.top = (lineTop - 15) + 'px';
            label.style.right = '10px';
            label.style.fontSize = '12px';
            label.style.fontWeight = 'bold';
            label.style.color = '#6366f1';
            label.style.backgroundColor = 'white';
            label.style.padding = '2px 8px';
            label.style.borderRadius = '4px';
            label.style.pointerEvents = 'none';
            label.style.zIndex = '6';
            label.textContent = `PAGE ${pageNum + 1}`;
            this.contentArea.appendChild(label);
        }

        // 마지막 페이지의 시작
        const totalPages = Math.ceil(contentHeight / scaledPageHeight);
        this.logPageBreakInfo(totalPages, scaledPageHeight);
    }

    logPageBreakInfo(totalPages, scaledPageHeight) {
        Logger.log('페이지 분할 정보', 'title');
        console.log(`📄 총 페이지 수: ${totalPages}`);
        console.log(`📏 페이지 높이: ${(this.pageHeightPx).toFixed(0)}px`);
        console.log(`🔍 Viewer Scale: ${this.viewerScale.toFixed(4)}`);
        console.log(`📊 실제 페이지 높이(스케일 적용): ${(scaledPageHeight).toFixed(0)}px`);
        console.log(`📐 콘텐츠 높이: ${(this.contentArea.scrollHeight).toFixed(0)}px`);

        if (this.selectedBreaks.size > 0) {
            console.log('');
            console.log('🔗 선택된 분할 지점:');
            const sortedBreaks = Array.from(this.selectedBreaks).sort((a, b) => a - b);
            sortedBreaks.forEach((breakIndex, idx) => {
                const blocks = this.contentArea.children;
                const block = blocks[breakIndex];
                const blockTop = block.offsetTop;
                const blockBottom = blockTop + block.offsetHeight;
                
                // 분할 위치가 어느 페이지와 겹치는지 계산
                const breakHeight = (blockBottom * this.viewerScale);
                const breakPage = Math.ceil(breakHeight / scaledPageHeight);
                const pageOffset = (breakHeight % scaledPageHeight).toFixed(0);
                
                console.log(`  [${idx + 1}] 블록 #${breakIndex + 1}`);
                console.log(`      ├─ 위치: ${blockTop.toFixed(0)}px ~ ${blockBottom.toFixed(0)}px`);
                console.log(`      ├─ 분할점: 페이지 ${breakPage}의 ${pageOffset}px 위치`);
                console.log(`      └─ 콘텐츠: "${block.textContent.substring(0, 40).trim()}..."`);
            });

            // 페이지별 콘텐츠량 분석
            console.log('');
            console.log('📑 페이지별 콘텐츠 할당:');
            let currentPageBottom = scaledPageHeight;
            for (let page = 1; page <= totalPages; page++) {
                const pageStart = (page - 1) * scaledPageHeight;
                const pageEnd = page * scaledPageHeight;
                
                // 이 페이지에 분할이 있는지 확인
                const splitsOnPage = Array.from(this.selectedBreaks).filter(idx => {
                    const block = this.contentArea.children[idx];
                    const breakHeight = (block.offsetTop + block.offsetHeight) * this.viewerScale;
                    return breakHeight >= pageStart && breakHeight <= pageEnd;
                });

                if (splitsOnPage.length > 0) {
                    console.log(`  페이지 ${page}: ⬇️ 분할 ${splitsOnPage.map(i => `#${i + 1}`).join(', ')}`);
                } else {
                    console.log(`  페이지 ${page}: ✓`);
                }
            }
        } else {
            console.log('📍 분할 지점이 선택되지 않았습니다.');
        }
    }

    updatePageBreakPreview() {
        if (!this.contentArea || this.isPrinting) return; // 추가된 코드

        // 기존 마커 제거
        document.querySelectorAll('.page-break-marker').forEach(marker => marker.remove());

        const blocks = this.contentArea.children;
        this.selectedBreaks.forEach(breakIndex => {
            if (breakIndex < blocks.length - 1) {
                const block = blocks[breakIndex];
                // transform 고려하여 위치 계산
                const relativeTop = (block.offsetTop + block.offsetHeight) * this.viewerScale;

                // 마커를 배지 형태로 생성 (점선 없음)
                const marker = document.createElement('div');
                marker.className = 'page-break-marker';
                marker.style.position = 'absolute';
                marker.style.top = (relativeTop - 10) + 'px';
                marker.style.left = '0';
                marker.style.width = '40px';
                marker.style.height = '20px';
                marker.style.background = '#6366f1';
                marker.style.color = 'white';
                marker.style.fontSize = '10px';
                marker.style.fontWeight = 'bold';
                marker.style.display = 'flex';
                marker.style.alignItems = 'center';
                marker.style.justifyContent = 'center';
                marker.style.borderRadius = '12px';
                marker.style.pointerEvents = 'none';
                marker.style.zIndex = '10';
                marker.textContent = '✂️';
                marker.title = `분할점 #${breakIndex + 1}`;

                this.contentArea.appendChild(marker);
            }
        });

        this.renderPageBreakLines();
    }

    setupInteraction() {
        if (!this.contentArea) {
            Logger.warn('setupInteraction: #content-area not found');
            return;
        }

        const blocks = this.contentArea.children;
        Logger.log(`setupInteraction: Found ${blocks.length} blocks`, 'info');

        Array.from(blocks).forEach((block, index) => {
            block.classList.add('notion-selectable-block');
            block.dataset.blockIndex = index;

            block.addEventListener('mouseenter', () => {
                const info = Utils.getBlockPageInfo(block, this.pageHeightPx);
                if (info.spansMultiplePages) {
                    block.style.outline = '2px solid #fbbf24';
                    block.title = `페이지 ${info.startPage + 1}~${info.endPage + 1}에 걸쳐 있음`;
                } else {
                    block.title = `페이지 ${info.startPage + 1}`;
                }
            });

            block.addEventListener('mouseleave', () => {
                block.style.outline = '';
            });

            block.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const idx = parseInt(block.dataset.blockIndex);

                if (this.selectedBreaks.has(idx)) {
                    this.selectedBreaks.delete(idx);
                    block.classList.remove('selected-break', 'block-has-break');
                } else {
                    this.selectedBreaks.add(idx);
                    block.classList.add('selected-break', 'block-has-break');
                }

                this.updateSidebar();
                this.updatePageBreakPreview();
            });
        });
    }

    updateSidebar() {
        const list = document.getElementById('break-list');
        const html = Utils.createBreaksListHTML(this.selectedBreaks, this.contentArea);
        list.innerHTML = html;
    }

    setupEventListeners() {
        this.generateBtn.addEventListener('click', () => this.onGenerateClick());
        window.addEventListener('resize', () => this.renderPageBreakLines());
    }

    async onGenerateClick() {
        try {
            this.generateBtn.disabled = true;
            this.loadingOverlay.style.display = 'flex';
            const statusText = document.querySelector('.loading-overlay p');
            statusText.innerText = "PDF 생성 중...";

            // 분할 정보 로깅
            Logger.log(`PDF 생성 시작 - 선택된 분할: ${this.selectedBreaks.size}개`, 'title');
            const contentHeight = this.contentArea.scrollHeight;
            const scaledPageHeight = this.pageHeightPx * this.viewerScale;
            const totalPages = Math.ceil(contentHeight / scaledPageHeight);
            this.logPageBreakInfo(totalPages, scaledPageHeight);

            if (this.mode === 'standard') {
                await this.generatePdfClient();
                this.loadingOverlay.style.display = 'none';
            } else {
                const params = new URLSearchParams(window.location.search);
                const payload = {
                    url: this.notionUrl,
                    mode: 'full',
                    format: this.format,
                    pageBreaks: Array.from(this.selectedBreaks).map(Number),
                    includeTitle: params.get('includeTitle') === 'true',
                    includeBanner: params.get('includeBanner') === 'true',
                    includeTags: params.get('includeTags') === 'true'
                };

                const response = await fetch('/convert-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const { jobId } = await response.json();
                this.trackJobStatus(jobId);
            }

        } catch (err) {
            Logger.error('PDF 생성 오류', err);
            alert('PDF 생성에 실패했습니다: ' + err.message);
            this.generateBtn.disabled = false;
            this.loadingOverlay.style.display = 'none';
        }
    }

   async generatePdfClient() {
        try {
            const element = document.getElementById('content-area');
            if (!element) {
                throw new Error('콘텐츠 영역을 찾을 수 없습니다.');
            }

            this.isPrinting = true; // 추가: 리사이즈 이벤트 차단 락(Lock) 설정

            Logger.log('Starting PDF generation based on popup.js logic...', 'info');

            this.generateBtn.disabled = true;
            this.loadingOverlay.style.display = 'flex';
            const statusText = document.querySelector('.loading-overlay p');
            if (statusText) statusText.innerText = "페이지 최적화 및 렌더링 준비 중...";

            // 1. 에디터 UI 요소(페이지 분할 마커 등) 숨기기
            document.querySelectorAll('.page-break-line, .page-break-marker, .page-number-label').forEach(el => {
                el.style.display = 'none';
            });

            // 2. popup.js를 참고한 DOM 최적화 작업
            // 이미지 지연 로딩 해제
            element.querySelectorAll('img[loading="lazy"]').forEach(img => img.removeAttribute('loading'));

            let freezeCSS = "";
            const layoutElements = element.querySelectorAll('.notion-image-block, .notion-asset-wrapper, div[data-block-id][style*="width"]');
            
            // 레이아웃을 구성하는 요소들 크기 고정 (Freeze)
            layoutElements.forEach((el, index) => {
                const id = `sn-freeze-${index}`;
                el.dataset.snFreeze = id;
                const rect = el.getBoundingClientRect();
                
                // viewerScale이 적용된 화면 크기를 원래 비율로 보정
                const actualWidth = rect.width / this.viewerScale;
                const actualHeight = rect.height / this.viewerScale;

                freezeCSS += `
                    [data-sn-freeze="${id}"] {
                        width: ${actualWidth}px !important;
                        max-width: ${actualWidth}px !important;
                        min-width: ${actualWidth}px !important;
                `;
                
                // 이미지 블록의 경우 비율 변형 방지를 위해 높이도 고정
                if (el.classList.contains('notion-image-block') || el.classList.contains('notion-asset-wrapper')) {
                    freezeCSS += `
                        height: ${actualHeight}px !important;
                        max-height: ${actualHeight}px !important;
                        min-height: ${actualHeight}px !important;
                    `;
                }
                freezeCSS += `}\n`;
            });

            // 공백(\u00A0) 및 줄바꿈 보존 처리
            const spans = element.querySelectorAll('span[data-token-index="0"]');
            spans.forEach(span => {
                // 추가된 코드: KaTeX 수식이 포함된 요소는 HTML DOM 구조 파괴를 막기 위해 건너뜀
                if (span.querySelector('.katex') || span.closest('.katex')) {
                    return;
                }

                let text = span.textContent;
                if (text.includes(" ")) text = text.replace(/ /g, '\u00A0');
                if (text.includes("\t")) text = text.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');

                if (text.includes("\n")) {
                    const lines = text.split("\n");
                    span.textContent = lines[0];
                    let currentSpan = span;
                    lines.slice(1).forEach(line => {
                        const br = document.createElement("br");
                        currentSpan.after(br);
                        const newSpan = span.cloneNode(false);
                        newSpan.textContent = line;
                        br.after(newSpan);
                        currentSpan = newSpan;
                    });
                } else {
                    span.textContent = text;
                }
            });
            // 3. 인쇄용 CSS 주입 (@media print 포함)
            const styleId = 'sn-print-style';
            let printStyle = document.getElementById(styleId);
            if (!printStyle) {
                printStyle = document.createElement('style');
                printStyle.id = styleId;
                document.head.appendChild(printStyle);
            }

            // popup.js의 스타일과 브라우저 인쇄 제어 스타일 병합
            printStyle.innerHTML = `
                ${freezeCSS}
                .notion-code-block, .notion-code-block span {
                    white-space: pre-wrap !important;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                }

                /* KaTeX 수식 중복 렌더링 방지 추가 */
                .katex-mathml,
                .katex-display .katex-mathml,
                .katex > .katex-mathml,
                .annotation {
                    display: none !important;
                }

                @media print {
                    @page {
                        size: ${this.format} portrait;
                        margin: 0;
                    }
                    body {
                        margin: 0;
                        padding: 0;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    /* 1. 사이드바, 헤더 및 마커/라벨 등 인쇄에 불필요한 UI 요소 완벽 숨김 */
                    .editor-header, .sidebar, .loading-overlay,
                    .page-break-marker, .page-break-line, .page-number-label {
                        display: none !important;
                    }
                    
                    /* 2. 블록 선택 시 나타나는 외곽선, 배경색 효과 제거 */
                    .notion-selectable-block, .selected-break, .block-has-break {
                        outline: none !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                    }

                    /* 3. 노션의 인쇄용 시스템 폰트 강제화 규칙 무력화 (이전 단계 유지) */
                    .katex .mathnormal { font-family: 'KaTeX_Math', serif !important; }
                    .katex .mord, .katex .mbin, .katex .mrel, .katex .mopen, .katex .mclose, 
                    .katex .mpunct, .katex .minner, .katex .mop, .katex .msupsub, .katex .mfrac, .katex .sizing { 
                        font-family: 'KaTeX_Main', serif !important; 
                    }
                    .katex .mathcal { font-family: 'KaTeX_Caligraphic', serif !important; }

                    /* 콘텐츠 영역 외곽 레이아웃 해제 */
                    .main-container {
                        display: block !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    #notion-viewer {
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        display: block !important;
                    }
                    #content-area {
                        position: relative !important;
                        transform: none !important;
                        width: ${this.contentWidthPx}px !important;
                        margin: 0 auto !important;
                        display: block !important;
                    }
                    
                    .user-page-break {
                        page-break-after: always;
                        break-after: page;
                    }
                }
            `;

            // 4. 사용자가 지정한 페이지 분할(selectedBreaks)을 CSS 클래스로 반영
            const blocks = element.children;
            this.selectedBreaks.forEach(breakIndex => {
                if (breakIndex < blocks.length - 1) {
                    blocks[breakIndex].classList.add('user-page-break');
                }
            });

            // 5. 브라우저 강제 리플로우 및 렌더링 대기 (popup.js와 동일)
            window.dispatchEvent(new Event('resize'));

            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(resolve));
            await new Promise(resolve => setTimeout(resolve, 1500)); // 렌더링 대기

            this.loadingOverlay.style.display = 'none';

            // 6. 브라우저 기본 인쇄 창 호출 ("PDF로 저장" 사용 유도)
            window.print();

            // 7. 인쇄 후 원래 UI 상태로 복구
            this.isPrinting = false; // 추가: 락 해제
            this.generateBtn.disabled = false;
            
            this.updatePageBreakPreview();
            
            // user-page-break 클래스 제거
            this.selectedBreaks.forEach(breakIndex => {
                if (breakIndex < blocks.length - 1) {
                    blocks[breakIndex].classList.remove('user-page-break');
                }
            });
            
            if (printStyle) {
                printStyle.remove();
            }

            Logger.success('브라우저 인쇄(PDF 생성) 작업 완료');

        } catch (err) {
            this.loadingOverlay.style.display = 'none';
            this.generateBtn.disabled = false;
            Logger.error('PDF 준비 오류', err);
            alert('PDF 준비 중 오류가 발생했습니다: ' + err.message);
        }
    }
    trackJobStatus(jobId) {
        const eventSource = new EventSource(`/job-events/${jobId}`);
        const statusText = document.querySelector('.loading-overlay p');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.status === 'completed') {
                eventSource.close();
                window.location.href = `/download/${data.result.fileName}`;
                this.loadingOverlay.style.display = 'none';
                this.generateBtn.disabled = false;
            } else if (data.status === 'failed') {
                eventSource.close();
                alert('PDF 생성 중 오류가 발생했습니다: ' + data.error);
                this.loadingOverlay.style.display = 'none';
                this.generateBtn.disabled = false;
            } else {
                statusText.innerText = `변환 진행 중... (${data.status})`;
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            alert('상태 확인 중 연결이 끊어졌습니다.');
            this.loadingOverlay.style.display = 'none';
            this.generateBtn.disabled = false;
        };
    }
}

// 페이지 로드 시 앱 초기화
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new StandardEditApp();
    });
} else {
    new StandardEditApp();
}
