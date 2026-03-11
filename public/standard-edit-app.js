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
        
        // 추가: 제목, 배너, 속성 포함 여부 옵션
        this.includeTitle = params.get('includeTitle') === 'true';
        this.includeBanner = params.get('includeBanner') === 'true';
        this.includeTags = params.get('includeTags') === 'true';

        // DOM Elements
        this.contentArea = document.getElementById('content-area');
        this.loadingSpinner = document.getElementById('loading-spinner');
        this.generateBtn = document.getElementById('generate-btn');
        this.loadingOverlay = document.getElementById('loading-spinner');

        this.formatSelect = document.getElementById('format-select');

        // State
        this.selectedBreaks = new Set();
        this.pageHeightPx = Utils.getPageHeight(this.format);
        this.contentWidthPx = 1080;
        this.viewerScale = 1;
        this.isPrinting = false;

        this.init();
    }

    async init() {
        try {
            Logger.log(`INIT Starting for URL: ${this.notionUrl}`, 'info');
            if (this.formatSelect) {
                this.formatSelect.value = this.format;
            }

            // 수정: API 요청 URL에 파라미터 추가
            const requestUrl = `/preview-html?url=${encodeURIComponent(this.notionUrl)}&includeTitle=${this.includeTitle}&includeBanner=${this.includeBanner}&includeTags=${this.includeTags}`;
            const response = await fetch(requestUrl);

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
            this.updateScaleAndLayout();

            // 8. 상호작용 설정
            Logger.log('INIT Setting up interaction...', 'info');
            this.setupInteraction();

            // 9. 페이지 구분선 렌더링
            Logger.log('INIT Rendering page layout...', 'info');
            this.updatePageBreakPreview(); 


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
        if (this.isPrinting) return;

        document.querySelectorAll('.page-break-line, .page-number-label, .page-break-marker, .page-background').forEach(el => el.remove());
        const blocks = Array.from(this.contentArea.children).filter(el => el.classList.contains('notion-selectable-block'));
        
        blocks.forEach(block => {
            if (block.dataset.pushedMargin) {
                block.style.marginTop = block.dataset.originalMargin || '';
                delete block.dataset.pushedMargin;
            }
            delete block.dataset.isPageStart; 
        });

        const margins = this.getMargins();
        const virtualPageHeight = this.pageHeightPx / this.viewerScale;
        const pageGap = 50; 
        
        // [변경] 사용자가 입력한 여백을 스케일에 맞춰 반영
        const pagePaddingTop = margins.top / this.viewerScale;
        const printSafetyMargin = 20; 
        const pagePaddingBottom = (margins.bottom / this.viewerScale) + printSafetyMargin; 
        
        this.contentArea.style.display = 'flow-root'; 
        this.contentArea.style.paddingTop = `${Math.max(0.1, pagePaddingTop)}px`;
        // [추가] 첫 번째 페이지의 Top Margin을 위해 contentArea에 패딩 탑 적용
        this.contentArea.style.paddingTop = `${pagePaddingTop}px`;
        
        let currentPage = 0;

        for (let i = 0; i < blocks.length; i++) {
            const block = blocks[i];
            const blockTop = block.offsetTop;
            const blockHeight = block.offsetHeight;
            
            const isManualBreak = i > 0 && this.selectedBreaks.has(parseInt(blocks[i - 1].dataset.blockIndex));
            
            const pageTopY = currentPage * (virtualPageHeight + pageGap);
            const pageBottomY = pageTopY + virtualPageHeight - pagePaddingBottom;
            
            const isAutoBreak = (blockTop + blockHeight) > pageBottomY; 

            if (isManualBreak || isAutoBreak) {
                currentPage++;
                block.dataset.isPageStart = 'true';
                
                const nextTargetY = currentPage * (virtualPageHeight + pageGap) + pagePaddingTop;
                const pushAmount = nextTargetY - blockTop;
                
                if (pushAmount > 0) {
                    block.dataset.originalMargin = block.style.marginTop;
                    block.dataset.pushedMargin = 'true';
                    block.style.marginTop = `${pushAmount}px`;
                }
            }
        }

        const totalPages = currentPage + 1;

        // [추가] 좌우 여백을 반영한 종이 배경 크기 계산
        const paperWidthScaled = Utils.getPageWidth(this.format) / this.viewerScale;
        const marginLeftScaled = margins.left / this.viewerScale;

        for (let pageNum = 0; pageNum < totalPages; pageNum++) {
            const pageTop = pageNum * (virtualPageHeight + pageGap);
            
            const pageBg = document.createElement('div');
            pageBg.className = 'page-background';
            pageBg.style.position = 'absolute';
            pageBg.style.top = `${pageTop}px`;
            
            // [변경] 좌측 여백만큼 왼쪽으로 당겨서 전체 종이 너비 렌더링
            pageBg.style.left = `-${marginLeftScaled}px`;
            pageBg.style.width = `${paperWidthScaled}px`;
            
            pageBg.style.height = `${virtualPageHeight}px`;
            pageBg.style.background = 'white';
            pageBg.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
            pageBg.style.zIndex = '-1';
            
            this.contentArea.appendChild(pageBg);
        }

        this.logPageBreakInfo(totalPages, virtualPageHeight);
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
        if (!this.contentArea || this.isPrinting) return;

        // 1. 블록들의 물리적 배치를 먼저 업데이트 (마진 변경 적용)
        this.renderPageBreakLines();

        // 2. 업데이트된 위치에 마커 다시 그리기
        document.querySelectorAll('.page-break-marker').forEach(marker => marker.remove());

        const blocks = this.contentArea.children;
        this.selectedBreaks.forEach(breakIndex => {
            if (breakIndex < blocks.length - 1) {
                const block = blocks[breakIndex];
                
                // 분할 위치 (밀어내기가 적용된 이후의 정확한 위치)
                const relativeTop = block.offsetTop + block.offsetHeight;

                const marker = document.createElement('div');
                marker.className = 'page-break-marker';
                marker.style.position = 'absolute';
                marker.style.top = (relativeTop - 10) + 'px';
                marker.style.left = '-30px'; // 문서 왼쪽 바깥으로 눈에 띄게 빼기
                marker.style.width = '40px';
                marker.style.height = '20px';
                marker.style.background = '#6366f1';
                marker.style.color = 'white';
                marker.style.fontSize = '12px';
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
        window.addEventListener('resize', () => this.updatePageBreakPreview());

        if (this.formatSelect) {
            this.formatSelect.addEventListener('change', (e) => this.onFormatChange(e.target.value));
        }


        ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('input', (e) => {
                    if (parseInt(e.target.value) < 0) {
                        e.target.value = 0;
                    }
                    
                    if (this.isPrinting) return;
                    this.updateScaleAndLayout();
                });
            }
        });
    }

    getMargins() {
        return {
            top: Math.max(0, parseInt(document.getElementById('marginTop')?.value) || 0),
            bottom: Math.max(0, parseInt(document.getElementById('marginBottom')?.value) || 0),
            left: Math.max(0, parseInt(document.getElementById('marginLeft')?.value) || 0),
            right: Math.max(0, parseInt(document.getElementById('marginRight')?.value) || 0)
        };
        }
    updateScaleAndLayout() {
        if (!this.contentArea || this.isPrinting) return;
        
        const margins = this.getMargins();
        const pageWidthPx = Utils.getPageWidth(this.format);
        
        // 좌우 여백을 뺀 '사용 가능한 너비'에 맞춰 콘텐츠 스케일링
        const usableWidthPx = Math.max(100, pageWidthPx - margins.left - margins.right);
        this.viewerScale = usableWidthPx / this.contentWidthPx;
        
        this.applyViewerScale();
        this.updatePageBreakPreview();
    }

    onFormatChange(newFormat) {
        if (this.isPrinting) return;
        
        Logger.log(`포맷 변경: ${this.format} -> ${newFormat}`, 'info');
        this.format = newFormat;
        
        // 1. 새로운 규격에 맞춰 높이와 스케일 재계산
        this.pageHeightPx = Utils.getPageHeight(this.format);
        const pageWidthPx = Utils.getPageWidth(this.format);
        this.viewerScale = pageWidthPx / this.contentWidthPx;
        
        // 2. URL 파라미터 업데이트 (새로고침 시 선택 유지)
        const url = new URL(window.location);
        url.searchParams.set('format', this.format);
        window.history.replaceState({}, '', url);
        
        // 3. 스케일 및 페이지 레이아웃 재적용
        this.updateScaleAndLayout();
        this.updatePageBreakPreview();
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
                const margins = this.getMargins(); // 여백 값 가져오기
                const payload = {
                    url: this.notionUrl,
                    mode: 'full',
                    format: this.format,
                    pageBreaks: Array.from(this.selectedBreaks).map(Number),
                    includeTitle: params.get('includeTitle') === 'true',
                    includeBanner: params.get('includeBanner') === 'true',
                    includeTags: params.get('includeTags') === 'true',
                    marginTop: margins.top,          // 추가
                    marginBottom: margins.bottom,    // 추가
                    marginLeft: margins.left,        // 추가
                    marginRight: margins.right       // 추가
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
            this.isPrinting = true;
            this.generateBtn.disabled = true;
            this.loadingOverlay.style.display = 'flex';
            
            // --- [수정할 부분 1] 인쇄 직전 레이아웃 원상 복구 ---
            document.querySelectorAll('.page-break-marker, .page-number-label, .page-background').forEach(el => {
                el.style.display = 'none';
            });

            // 시각적 페이징을 위해 밀어냈던(Margin) 블록 위치 초기화 및 강제 분할 클래스 부여
            Array.from(element.children).forEach(block => {
                if (block.dataset.pushedMargin) {
                    block.style.marginTop = block.dataset.originalMargin || '';
                }
                // 추가됨: 마킹된 블록에 자동 분할 클래스 추가
                if (block.dataset.isPageStart === 'true') {
                    block.classList.add('auto-page-break');
                }
            });

            // 인쇄 엔진(Print)이 인식할 수 있도록 기존 박스 스타일 복구
            element.style.background = 'white';
            element.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.1)';
            element.style.paddingBottom = '50px';

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
            // [추가된 부분] 규격별 정확한 물리적 인쇄 사이즈 반환
            const getPrintPageSize = (format) => {
                const sizes = {
                    'A4': '210mm 297mm',
                    'A3': '297mm 420mm',
                    'ISO_B5': '176mm 250mm',
                    'B5_JIS': '182mm 257mm',
                    'Letter': '8.5in 11in'
                };
                return sizes[format] || '210mm 297mm';
            };

            // 3. 인쇄용 CSS 주입 (@media print 포함)
            const styleId = 'sn-print-style';
            let printStyle = document.getElementById(styleId);
            if (!printStyle) {
                printStyle = document.createElement('style');
                printStyle.id = styleId;
                document.head.appendChild(printStyle);
            }

            const margins = this.getMargins();

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
                        size: ${getPrintPageSize(this.format)};
                        /* [수정] 사용자가 지정한 여백 적용 */
                        margin: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px !important;
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

                    /* 3. 노션의 인쇄용 시스템 폰트 강제 무시 */
                    katex .mathnormal { font-family: 'KaTeX_Math', serif !important; }
                    .katex .mord, .katex .mbin, .katex .mrel, .katex .mopen, .katex .mclose, 
                    .katex .mpunct, .katex .minner, .katex .mop, .katex .msupsub, .katex .mfrac, .katex .sizing { 
                        font-family: 'KaTeX_Main', serif !important; 
                    }
                    .katex .mathcal { font-family: 'KaTeX_Caligraphic', serif !important; }
                    .katex .mathbb, .katex .mathfrak, .katex .amsrm { font-family: 'KaTeX_AMS', serif !important; }
                    .katex .size1 { font-family: 'KaTeX_Size1', serif !important; }
                    .katex .size2 { font-family: 'KaTeX_Size2', serif !important; }
                    .katex .mathit { font-family: 'KaTeX_Main', serif !important; font-style: italic !important; }

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
                        /* [수정] 패딩 0.1px 및 flow-root 적용하여 마진 이탈 방지 */
                        padding: 0.1px 0 0 0 !important; 
                        display: flow-root !important;   
                        zoom: ${this.viewerScale} !important;
                    }
                    
                    .user-page-break {
                        page-break-after: always;
                        break-after: page;
                    }

                    /* 사용자가 직접 분할한 지점 (그 블록 '뒤'에서 넘김) */
                    .user-page-break {
                        page-break-after: always !important;
                        break-after: page !important;
                    }
                    
                    /* 자동 분할된 지점 (그 블록 '앞'에서 넘김) */
                    .auto-page-break {
                        page-break-before: always !important;
                        break-before: page !important;
                    }

                    #content-area > div.notion-selectable-block.selected-break.block-has-break > div::after {
                        display: none !important;
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
            this.isPrinting = false;
            this.generateBtn.disabled = false;
            
            // 클래스 제거 시 auto-page-break도 함께 제거
            Array.from(element.children).forEach(block => {
                block.classList.remove('auto-page-break');
            });
            
            this.selectedBreaks.forEach(breakIndex => {
                if (breakIndex < blocks.length - 1) {
                    blocks[breakIndex].classList.remove('user-page-break');
                }
            });
            
            if (printStyle) printStyle.remove();

            // 변경된 부분: 분할된 페이지 UI 다시 계산 후 그리기
            this.updatePageBreakPreview();

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
