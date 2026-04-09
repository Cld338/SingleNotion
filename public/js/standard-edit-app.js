/**
 * Main Application Logic for Standard Edit Page
 */

class StandardEditApp {
    constructor() {
        // URL Parameters
        const params = new URLSearchParams(window.location.search);
        this.notionUrl = params.get('url');
        this.sessionId = params.get('sessionId');
        this.source = params.get('source'); // 'extension' or undefined
        this.format = params.get('format') || 'SINGLE';
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
            // sessionId 또는 url 중 하나 필요
            if (!this.sessionId && !this.notionUrl) {
                throw new Error('url 또는 sessionId 파라미터가 필요합니다.');
            }

            const dataSource = this.sessionId ? `sessionId=${this.sessionId}` : `URL=${this.notionUrl}`;
            Logger.log(`INIT Starting for ${dataSource}`, 'info');
            
            if (this.formatSelect) {
                this.formatSelect.value = this.format;
                // Extension에서 들어온 경우 SINGLE 포맷 옵션 비활성화
                // if (this.source === 'extension') {
                //     const singleOption = Array.from(this.formatSelect.options).find(opt => opt.value === 'SINGLE');
                //     if (singleOption) {
                //         singleOption.disabled = true;
                //     }
                // }
            }

            const params = new URLSearchParams(window.location.search);
            document.getElementById('chk-title').checked = params.get('includeTitle') !== 'false'; 
            document.getElementById('chk-banner').checked = params.get('includeBanner') !== 'false';
            document.getElementById('chk-tags').checked = params.get('includeTags') !== 'false';

            // 데이터 로드 - sessionId가 있으면 session-data에서, 아니면 preview-html에서
            let requestUrl;
            if (this.sessionId) {
                // Extension에서 캡처한 데이터 로드
                requestUrl = `/session-data/${this.sessionId}`;
                Logger.log('Extension session 데이터 로드 중...', 'info');
            } else {
                // 기존 방식: Notion URL에서 데이터 로드
                requestUrl = `/preview-html?url=${encodeURIComponent(this.notionUrl)}&includeTitle=true&includeBanner=true&includeTags=true`;
                Logger.log(`Notion URL 데이터 로드 중: ${this.notionUrl}`, 'info');
            }

            const response = await fetch(requestUrl);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            Logger.log('INIT Response received', 'success', {
                htmlLength: data.html?.length || 0,
                detectedWidth: data.detectedWidth,
                detectedHeight: data.detectedHeight,
                cssCount: data.resources?.cssLinks?.length || 0,
                source: data.metadata?.source || 'direct'
            });

            if (!data.html) {
                throw new Error('No HTML content received from server');
            }

            // ⚠️ Height가 0px인 경우 경고 표시
            if (data.detectedHeight === 0) {
                alert('⚠️ 페이지에 콘텐츠가 없습니다\n\n우측 상단 \'공유\'에서 게시(웹에서 게시) 또는링크가 있는 모든 사용자 상태여야 합니다.');
            }

            const { html, detectedWidth, resources, metadata } = data;

            // Extension 데이터인 경우 metadata에서 URL 추출
            if (metadata?.url && !this.notionUrl) {
                this.notionUrl = metadata.url;
                Logger.log(`URL extracted from metadata: ${this.notionUrl}`, 'info');
            }

            // 리소스 로깅
            Logger.log('로드된 리소스 정보', 'title');
            Logger.logResources(resources);

            // 뷰어 스케일 계산
            this.contentWidthPx = detectedWidth || 1080;
            const pageWidthPx = Utils.getPageWidth(this.format);
            this.viewerScale = pageWidthPx / this.contentWidthPx;

            Logger.log(`INIT Scale: ${this.viewerScale.toFixed(4)} (Page: ${pageWidthPx}px, Content: ${this.contentWidthPx}px)`, 'info');

            // 1. CSS 로드 - Extension인 경우 콘텐츠 영역으로 한정
            if (resources?.cssLinks?.length) {
                if (this.source === 'extension') {
                    Logger.log('INIT Loading CSS (scoped to content-area)...', 'info');
                    await Utils.loadCSSResourcesScoped(resources.cssLinks, '#content-area');
                } else {
                    Logger.log('INIT Loading CSS (global scope)...', 'info');
                    await Utils.loadCSSResources(resources.cssLinks);
                }
            }

            // 2. 인라인 스타일 로드 - Extension인 경우 콘텐츠 영역으로 한정
            if (resources?.inlineStyles?.length) {
                if (this.source === 'extension') {
                    Logger.log('INIT Loading inline styles (scoped to content-area)...', 'info');
                    Utils.loadInlineStylesScoped(resources.inlineStyles, '#content-area');
                } else {
                    Logger.log('INIT Loading inline styles (global scope)...', 'info');
                    Utils.loadInlineStyles(resources.inlineStyles);
                }
            }

            // 3. 스크립트 로드 (외부 + 인라인)
            if (resources?.scripts?.length) {
                Logger.log('INIT Loading scripts...', 'info');
                await Utils.loadScripts(resources.scripts);
            }

            // 4. 아이콘 로드
            if (resources?.icons?.length) {
                Logger.log('INIT Loading icons...', 'info');
                Utils.loadIcons(resources.icons);
            }

            // 5. 웹 폰트 로드
            if (resources?.fonts?.length) {
                Logger.log('INIT Loading fonts...', 'info');
                Utils.loadFonts(resources.fonts);
            }

            // 6. KaTeX 리소스 로드
            if (resources?.katexResources?.length) {
                Logger.log('INIT Loading KaTeX resources...', 'info');
                await Utils.loadKaTeX(resources.katexResources);
            }

            // 7. 비디오/오디오 메타데이터 로깅
            if (resources?.videos?.length) {
                Logger.log(`INIT Video/Audio media found: ${resources.videos.length} items`, 'info');
            }

            // 8. DEBUG 정보 저장
            const debugInfo = {
                cssLoaded: resources?.cssLinks?.length || 0,
                stylesLoaded: resources?.inlineStyles?.length || 0,
                scriptsLoaded: resources?.scripts?.length || 0,
                iconsLoaded: resources?.icons?.length || 0,
                fontsLoaded: resources?.fonts?.length || 0,
                katexLoaded: resources?.katexResources?.length || 0,
                videosLoaded: resources?.videos?.length || 0,
                contentWidth: detectedWidth,
                scale: this.viewerScale,
                timestamp: new Date().toISOString(),
                url: this.notionUrl || `sessionId=${this.sessionId}`,
                source: this.source || 'direct'
            };
            localStorage.setItem('debug-preview-info', JSON.stringify(debugInfo));
            Logger.log('DEBUG Info saved to localStorage', 'debug', debugInfo);

            // 9. HTML 주입
            Logger.log('INIT Injecting HTML...', 'info');
            
            // [디버그] 주입 전 HTML 상태 확인
            const styleMatchBefore = html.match(/style="[^"]{0,150}"/i);
            if (styleMatchBefore) {
                Logger.log(`[DEBUG-BEFORE-INJECTION] Style sample: ${styleMatchBefore[0]}`, 'debug');
            }
            const maskMatchBefore = html.match(/mask:\s*url\([^)]+\)/i);
            if (maskMatchBefore) {
                Logger.log(`[DEBUG-BEFORE-INJECTION] Mask URL: ${maskMatchBefore[0]}`, 'debug');
            }
            
            this.contentArea.innerHTML = html;
            
            // [디버그] 주입 후 DOM 상태 확인
            const injectedStyle = this.contentArea.querySelector('[style*="mask"]');
            if (injectedStyle) {
                Logger.log(`[DEBUG-AFTER-INJECTION] Style attribute: ${injectedStyle.getAttribute('style')}`, 'debug');
            }
            
            // 테이블이 화면을 벗어나는 문제
            const targetElements = this.contentArea.querySelectorAll('.notion-table-content');
            targetElements.forEach(el => {
                el.style.paddingLeft = '0px';
                el.style.paddingRight = '0px';
            });
            targetElements.forEach(el => {
                const ancestor = el.parentElement?.parentElement?.parentElement?.parentElement;
                if (ancestor) {
                    ancestor.style.width = '';
                }
            });

            // 10. 상대 경로 수정
            Logger.log('INIT Fixing relative paths...', 'info');
            Utils.fixRelativePaths(this.notionUrl, this.contentArea);

            // 11. CSS 적용 대기
            Logger.log('INIT Waiting for CSS to apply...', 'info');
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    setTimeout(resolve, 800);
                });
            });

            // 12. 뷰어 스케일 적용
            Logger.log('INIT Applying viewer scale...', 'info');
            this.updateScaleAndLayout();

            // 13. 상호작용 설정
            Logger.log('INIT Setting up interaction...', 'info');
            this.setupInteraction();

            // 14. 페이지 구분선 렌더링
            Logger.log('INIT Rendering page layout...', 'info');
            this.updatePageBreakPreview(); 

            // 15. DOM 상태 로깅
            Logger.logDomStatus();

            // 16. 텍스트 선택 방지
            this.contentArea.addEventListener('selectstart', (e) => e.preventDefault());
            this.contentArea.addEventListener('select', (e) => e.preventDefault());
            this.contentArea.addEventListener('dblclick', (e) => e.preventDefault());

            // 17. 이벤트 리스너 설정
            this.setupEventListeners();

            Logger.log('INIT ✓ Preview loaded successfully!', 'success');

            this.loadingSpinner.style.display = 'none';
            this.contentArea.style.display = 'block';

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
            
            // [수정된 부분] 좌우 여백의 차이를 계산하여 종이의 시각적 정중앙을 화면 중앙에 맞춤
            const margins = this.getMargins();
            const offsetPx = (margins.left - margins.right) / 2;
            this.contentArea.style.marginLeft = `${offsetPx}px`;

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

       if (this.format === 'SINGLE') {
            const paperWidthScaled = Utils.getPageWidth('SINGLE') / this.viewerScale;
            const marginLeftScaled = margins.left / this.viewerScale;
            
            // 화면 상에서 여백이 스케일의 영향을 받지 않도록 스케일만큼 역산하여 패딩 부여
            const pt = margins.top / this.viewerScale;
            const pb = margins.bottom / this.viewerScale;
            
            this.contentArea.style.paddingTop = `${Math.max(0.1, pt)}px`;
            this.contentArea.style.paddingBottom = `${pb}px`;
            
            // 실제 콘텐츠 전체 높이 (위에서 부여한 상하 패딩이 포함된 높이)
            const contentRealHeight = this.contentArea.scrollHeight;
            
            const pageBg = document.createElement('div');
            pageBg.className = 'page-background';
            pageBg.style.position = 'absolute';
            pageBg.style.top = `0px`;
            pageBg.style.left = `-${marginLeftScaled}px`;
            pageBg.style.width = `${paperWidthScaled}px`;
            pageBg.style.height = `${contentRealHeight}px`;
            pageBg.style.background = 'white';
            pageBg.style.boxShadow = '0 8px 20px rgba(0, 0, 0, 0.15)';
            pageBg.style.zIndex = '-1';
            
            this.contentArea.appendChild(pageBg);
            return; // 이후의 다중 페이지 계산 로직 스킵
        }
        
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

        // [추가] 단일 페이지(SINGLE) 포맷일 경우 마커를 새로 그리지 않고 종료
        if (this.format === 'SINGLE') {
            return;
        }

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

    setupToggleInteraction() {
        /**
         * 토글 버튼 클릭 상호작용 설정
         * - 토글 버튼을 클릭하면 펼침/접음 상태 변경
         * - 블록 클릭(페이지 분할) 이벤트와 구분
         * - 토글 상태가 PDF에도 반영됨
         */
        if (!this.contentArea) {
            return;
        }

        // 이벤트 위임(Event Delegation) 방식 사용
        // 현재와 미래에 추가될 토글 버튼 모두 처리
        this.contentArea.addEventListener('click', (e) => {
            const button = e.target.closest('.notion-toggle-block [role="button"]');
            if (!button) return;

            // 이벤트 전파 중지 (부모 블록의 클릭 이벤트 방지)
            e.stopPropagation();
            e.preventDefault();

            // aria-expanded 상태 토글 (true <-> false)
            const isExpanded = button.getAttribute('aria-expanded') === 'true';
            const newState = !isExpanded;
            button.setAttribute('aria-expanded', newState);

            // aria-label 업데이트 (접기 <-> 열기)
            button.setAttribute('aria-label', newState ? '닫기' : '열기');

            // SVG 회전 애니메이션 업데이트
            const svg = button.querySelector('svg');
            if (svg) {
                svg.style.transform = newState ? 'rotateZ(0deg)' : 'rotateZ(-90deg)';
            }

            // aria-controls로 지정된 요소 표시/숨김 토글
            const controlsId = button.getAttribute('aria-controls');
            if (controlsId) {
                const controlledElement = document.getElementById(controlsId);
                if (controlledElement) {
                    // 1. 토글 상태 저장 (data 속성에 원래 display 값 저장)
                    if (!button.dataset.originalDisplay) {
                        const computedDisplay = window.getComputedStyle(controlledElement).display;
                        button.dataset.originalDisplay = computedDisplay || 'flex';
                    }

                    // 2. display 상태 업데이트
                    const originalDisplay = button.dataset.originalDisplay;
                    controlledElement.style.display = newState ? originalDisplay : 'none';

                    Logger.log(
                        `Toggle [${controlsId}]: ${newState ? 'expanded' : 'collapsed'} (display: ${controlledElement.style.display})`,
                        'debug'
                    );

                    // 3. 점차적인 너비 변경으로 인한 레이아웃 재계산 강제
                    this.contentArea.style.display = 'none';
                    void this.contentArea.offsetHeight; // 리플로우 강제 트리거
                    this.contentArea.style.display = 'block';
                }
            }
        }, true); // 캡처 단계에서 처리하여 더 빨리 반응

        Logger.log('setupToggleInteraction: Event delegation setup complete', 'info');
    }

    setupInteraction() {
        if (!this.contentArea) {
            Logger.warn('setupInteraction: #content-area not found');
            return;
        }

        // 1. 토글 버튼 상호작용 먼저 설정
        this.setupToggleInteraction();

        const blocks = this.contentArea.children;
        Logger.log(`setupInteraction: Found ${blocks.length} blocks`, 'info');

        Array.from(blocks).forEach((block, index) => {
            block.classList.add('notion-selectable-block');
            block.dataset.blockIndex = index;

            // block.addEventListener('mouseenter', () => {
            //     if (this.format === 'SINGLE') return;
            //     const info = Utils.getBlockPageInfo(block, this.pageHeightPx);
            //     if (info.spansMultiplePages) {
            //         block.style.outline = '2px solid #fbbf24';
            //         block.title = `페이지 ${info.startPage + 1}~${info.endPage + 1}에 걸쳐 있음`;
            //     } else {
            //         block.title = `페이지 ${info.startPage + 1}`;
            //     }
            // });

            block.addEventListener('mouseleave', () => {
                block.style.outline = '';
            });

            block.addEventListener('click', (e) => {
                // 2. 토글 버튼이 클릭된 경우 페이지 분할 이벤트 무시
                const toggleButton = e.target.closest('.notion-toggle-block [role="button"]');
                if (toggleButton) {
                    return; // 토글 클릭은 setupToggleInteraction에서 처리됨
                }

                if (this.format === 'SINGLE') return;
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

        // [추가] 리스트 아이템 클릭 시 해당 블록으로 스크롤 이동
        list.querySelectorAll('.break-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const idx = item.dataset.blockIndex;
                const block = this.contentArea.children[idx];
                
                if (block) {
                    // 화면 중앙으로 부드럽게 스크롤
                    block.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    // 시각적 피드백 (블록 배경색을 잠시 보라색으로 강조)
                    const originalBg = block.style.backgroundColor;
                    const originalTransition = block.style.transition;
                    
                    block.style.transition = 'background-color 0.3s ease';
                    block.style.backgroundColor = 'rgba(99, 102, 241, 0.15)';
                    
                    setTimeout(() => {
                        block.style.backgroundColor = originalBg;
                        setTimeout(() => { block.style.transition = originalTransition; }, 300);
                    }, 800);
                }
            });
        });
    }

    setupEventListeners() {
        // Mobile Sidebar Toggle
        this.setupMobileSidebarToggle();

        this.generateBtn.addEventListener('click', () => this.onGenerateClick());
        window.addEventListener('resize', () => this.updatePageBreakPreview());

        if (this.formatSelect) {
            this.formatSelect.addEventListener('change', (e) => this.onFormatChange(e.target.value));
        }

        const pw = document.getElementById('pageWidth');
        if (pw) {
            pw.addEventListener('input', () => {
                if (this.isPrinting) return;
                this.updateScaleAndLayout();
            });
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

        // [추가] 표시 옵션 체크박스 이벤트 리스너
        ['chk-title', 'chk-banner', 'chk-tags'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.updateVisibility());
            }
        });
    }

    setupMobileSidebarToggle() {
        const toggleBtn = document.getElementById('sidebar-toggle');
        const sidebar = document.querySelector('.sidebar');
        const sidebarOverlay = document.getElementById('sidebar-overlay');

        if (!toggleBtn || !sidebar) return;

        const openSidebar = () => {
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        };

        const closeSidebar = () => {
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            document.body.style.overflow = '';
        };

        // Toggle button click
        toggleBtn.addEventListener('click', () => {
            if (sidebar.classList.contains('active')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        // Overlay click to close
        sidebarOverlay.addEventListener('click', () => {
            closeSidebar();
        });

        // Close sidebar when a setting changes (optional, for UX)
        const sidebarInputs = sidebar.querySelectorAll('input, select, button:not(.sidebar-toggle-btn)');
        sidebarInputs.forEach(input => {
            if (input.id === 'generate-btn') {
                // Keep sidebar open for generate button
                return;
            }
        });

        // Close sidebar on window resize to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 767) {
                closeSidebar();
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
        
        // Extension에서 들어온 경우 SINGLE 포맷 선택 차단
        if (this.source === 'extension' && newFormat === 'SINGLE') {
            Logger.log('Extension에서는 단일 페이지 포맷이 지원되지 않습니다.', 'warn');
            this.formatSelect.value = this.format; // 이전 포맷으로 복구
            return;
        }
        
        Logger.log(`포맷 변경: ${this.format} -> ${newFormat}`, 'info');
        this.format = newFormat;
        
        // --- [추가] 단일 페이지 UI 토글 로직 ---
        const breakSection = document.getElementById('page-break-section');
        const singleOptions = document.getElementById('single-page-options');
        
        if (this.format === 'SINGLE') {
            if (breakSection) breakSection.style.display = 'none';
            if (singleOptions) singleOptions.style.display = 'block';
            this.selectedBreaks.clear(); // 분할 지점 초기화
            this.updateSidebar();
        } else {
            if (breakSection) breakSection.style.display = 'block';
            if (singleOptions) singleOptions.style.display = 'none';
        }
        
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
            document.body.classList.add('pdf-generating');
            this.generateBtn.disabled = true;
            this.loadingOverlay.style.display = 'flex';
            
            const statusText = document.querySelector('.loading-overlay .loading-text');

            // 포맷이 'SINGLE'인 경우 서버 사이드 렌더링(edit 페이지 방식) 사용
            if (this.format === 'SINGLE') {
                if (statusText) statusText.innerText = "서버에서 PDF를 생성 중입니다...";
                
                const margins = this.getMargins();
                const options = {
                    url: this.notionUrl,
                    sessionId: this.sessionId || undefined,
                    includeTitle: document.getElementById('chk-title').checked,
                    includeBanner: document.getElementById('chk-banner').checked,
                    includeTags: document.getElementById('chk-tags').checked,
                    marginTop: margins.top,
                    marginBottom: margins.bottom,
                    marginLeft: margins.left,
                    marginRight: margins.right,
                    pageWidth: parseInt(document.getElementById('pageWidth').value) || 1080,
                    mode: 'full' // 서버의 pdfService.generatePdf 로직 사용
                };

                const response = await fetch('/convert-url', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(options)
                });

                const resData = await response.json();
                if (!response.ok) throw new Error(resData.error || '요청 실패');

                // SSE를 통해 작업 완료 대기
                await this.trackJobStatus(resData.jobId);
                
            } else {
                // 표준 규격(A4 등)은 기존의 클라이언트 사이드 인쇄 방식 유지
                if (statusText) statusText.innerText = "PDF 생성 준비 중...";
                await this.generatePdfClient();
            }
            
            this.loadingOverlay.style.display = 'none';
            this.generateBtn.disabled = false;

        } catch (err) {
            Logger.error('PDF 생성 오류', err);
            alert('PDF 생성에 실패했습니다: ' + err.message);
            this.generateBtn.disabled = false;
            this.loadingOverlay.style.display = 'none';
        } finally {
            document.body.classList.remove('pdf-generating');
        }
    }

    // [추가] 체크박스 상태에 따라 CSS를 주입하여 요소를 숨기고 페이지 분할 재계산
    updateVisibility() {
        let styles = '';
        
        // pdfService.js의 CSS 셀렉터를 참고하여 숨김 처리
        if (!document.getElementById('chk-title').checked) {
            styles += `#content-area h1, #content-area .notion-page-block:has(h1) { display: none !important; }\n`;
        }
        if (!document.getElementById('chk-banner').checked) {
            styles += `#content-area .notion-page-cover-wrapper, #content-area .notion-page-controls { display: none !important; }\n`;
        }
        if (!document.getElementById('chk-tags').checked) {
            styles += `#content-area [aria-label="페이지 속성"], #content-area [aria-label="Page properties"], #content-area div[role="table"][aria-label="Page properties"] + div, #content-area div[role="table"][aria-label="페이지 속성"] + div { display: none !important; }\n`;
        }

        let styleEl = document.getElementById('sn-display-options-style');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'sn-display-options-style';
            document.head.appendChild(styleEl);
        }
        styleEl.innerHTML = styles;

        // 요소가 사라지거나 나타나면 콘텐츠 전체 높이가 변하므로 약간의 지연 후 페이지 분할 재계산
        if (!this.isPrinting) {
            setTimeout(() => {
                this.updateScaleAndLayout();
            }, 50);
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
            element.style.paddingBottom = '0px';

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

            // [수정] 단일 페이지 여부에 따른 페이지 크기 및 여백 계산
            let pageSizeStr = '';
            let pageMarginCSS = '';
            let contentPaddingCSS = '0.1px 0 0 0';

            if (this.format === 'SINGLE') {
                const targetWidth = Utils.getPageWidth('SINGLE');
                
                // 인쇄 시 순수 콘텐츠 높이를 정확히 측정하기 위해 미리보기용 패딩 임시 제거
                const tempPt = this.contentArea.style.paddingTop;
                const tempPb = this.contentArea.style.paddingBottom;
                this.contentArea.style.paddingTop = '0.1px';
                this.contentArea.style.paddingBottom = '0px';
                
                const pureHeight = this.contentArea.scrollHeight;
                
                // 측정 후 화면 복구
                this.contentArea.style.paddingTop = tempPt;
                this.contentArea.style.paddingBottom = tempPb;
                
                // 전체 PDF 높이 = (순수 콘텐츠 높이 * 스케일) + 상단 여백 + 하단 여백 + 여유 버퍼(2px)
                const targetHeight = Math.ceil(pureHeight * this.viewerScale) + margins.top + margins.bottom + 2;
                
                pageSizeStr = `${targetWidth}px ${targetHeight}px`;
                
                // 단일 페이지도 @page margin을 사용하여 절대적인 픽셀 여백 확보
                pageMarginCSS = `margin: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px !important;`;
                contentPaddingCSS = `0.1px 0 0 0`; // PDF 내부 패딩 초기화
            } else {
                pageSizeStr = getPrintPageSize(this.format);
                pageMarginCSS = `margin: ${margins.top}px ${margins.right}px ${margins.bottom}px ${margins.left}px !important;`;
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
                    .navbar, .sidebar, .loading-overlay,
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
                    #content-area > div.notion-selectable.notion-table_of_contents-block.notion-selectable-block.selected-break.block-has-break > div::after {
                        display: none !important;
                    }

                    .loading-overlay {
                     z-index: 0 !important;
                    }

                    .notion-selectable-block.block-has-break::after {
                        border: none !important;
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
            // await new Promise(resolve => setTimeout(resolve, 1500)); // 렌더링 대기

            this.loadingOverlay.style.display = 'none';

            // 6. 브라우저 기본 인쇄 창 호출 ("PDF로 저장" 사용 유도)
            window.print();

            // 7. 인쇄 후 원래 UI 상태로 복구
            this.isPrinting = false;
            this.generateBtn.disabled = false;

            element.style.background = 'none';
            element.style.boxShadow = 'none';
            
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
        return new Promise((resolve, reject) => {
            const eventSource = new EventSource(`/job-events/${jobId}`);
            const statusText = document.querySelector('.loading-overlay .loading-text');

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.status === 'completed') {
                    eventSource.close();
                    // 생성된 파일을 다운로드 URL로 트리거
                    const downloadUrl = `/download/${data.result.fileName}`;
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = data.result.fileName;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    resolve(data.result);
                } else if (data.status === 'failed' || data.status === 'error') {
                    eventSource.close();
                    reject(new Error(data.error || 'PDF 변환 실패(응답 없음)'));
                } else {
                    if (statusText) statusText.innerText = `PDF 변환 진행 중...`;
                }
            };

            eventSource.onerror = () => {
                eventSource.close();
                reject(new Error('서버와의 연결이 끊어졌습니다.'));
            };
        });
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
