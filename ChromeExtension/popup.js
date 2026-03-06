document.getElementById('convertBtn').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.url.includes("notion.so") && !tab.url.includes("notion.site")) {
        alert("노션 페이지에서 실행해주세요.");
        return;
    }

    const submitBtn = document.getElementById('convertBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    
    submitBtn.disabled = true;
    loadingOverlay.style.display = 'flex';

    try {
        // 현재 탭의 실제 너비(width)를 가져옵니다.
        // const width = currentTab.width || 1080; // 기본값 1080 설정

        // 1. Content Script 실행 (페이지 최적화 및 높이 계산)
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: prepareNotionPage,
            args: [{ 
                includeTitle: document.getElementById('includeTitle').checked,
                includeBanner: document.getElementById('includeBanner').checked,
                includeTags: document.getElementById('includeTags').checked,
                includeDiscussion: document.getElementById('includeDiscussion').checked,
            }]
        });

        if (!results || !results[0].result) throw new Error("페이지 분석 실패");

        const { height, width } = results[0].result;
        
        // 2. Background에 PDF 생성 요청
        chrome.runtime.sendMessage({
            action: "generate_pdf",
            tabId: tab.id,
            height: height,
            width: width
        }, (response) => {
            submitBtn.disabled = false;
            loadingOverlay.style.display = 'none';
            
            if (response && response.success) {
                console.log("PDF 생성 완료");
            } else {
                alert("PDF 생성 실패: " + (response ? response.error : "알 수 없는 오류"));
            }
        });

    } catch (err) {
        alert("오류 발생: " + err.message);
        
        // 에러 시에도 스크롤 기능을 복구합니다.
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: cleanupNotionPage // background.js에 작성한 함수와 동일한 로직 호출
        });

        submitBtn.disabled = false;
        loadingOverlay.style.display = 'none';
    }
});

/**
 * 노션 페이지 스타일 조정 및 높이 계산 함수 (기존 로직 유지)
 */
async function prepareNotionPage(options) {
    const { includeTitle, includeBanner, includeTags, includeDiscussion } = options;
    
    document.querySelectorAll('img[loading="lazy"]').forEach(img => img.removeAttribute('loading'));
    const contentEl = document.querySelector('.notion-page-content');
    const width = contentEl ? contentEl.getBoundingClientRect().width  : 1080;
    
    // 레이지 로딩 해제를 위한 스크롤 로직
    await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight + 100) {
                clearInterval(timer);
                window.scrollTo(0, 0);
                resolve();
            }
        }, 100);
    });


    let freezeCSS = "";
    
    // 이미지 블록, 미디어 래퍼, 다단(Column) 등 레이아웃을 구성하는 요소들 선택
    const layoutElements = document.querySelectorAll('.notion-image-block, .notion-asset-wrapper, div[data-block-id][style*="width"]');
    
    layoutElements.forEach((el, index) => {
        const id = `sn-freeze-${index}`;
        el.dataset.snFreeze = id;
        const rect = el.getBoundingClientRect();
        
        freezeCSS += `
            [data-sn-freeze="${id}"] {
                width: ${rect.width}px !important;
                max-width: ${rect.width}px !important;
                min-width: ${rect.width}px !important;
        `;
        
        // 이미지 블록의 경우 높이도 고정하여 비율 변형 방지
        if (el.classList.contains('notion-image-block') || el.classList.contains('notion-asset-wrapper')) {
            freezeCSS += `
                height: ${rect.height}px !important;
                max-height: ${rect.height}px !important;
                min-height: ${rect.height}px !important;
            `;
        }
        freezeCSS += `}\n`;
    });

    // CSS 주입: 전달받은 width를 기반으로 스타일 고정
    const hideStyles = `


        .notion-page-content {
            width: ${width}px !important;
            max-width: ${width}px !important;
            min-width: ${width}px !important;
        }

        .notion-sidebar-container, 
        .notion-topbar, 
        .notion-topbar-mobile,
        .notion-help-button,
        #skip-to-content,
        header,
        .autolayout-fill-width,
        .notion-history-container
        { display: none !important; }

        .notion-floating-table-of-contents {
            height: 1px !important;
        }
        
        div[role="table"][aria-label="Page properties"] + div,
        div[role="table"][aria-label="페이지 속성"] + div
        { display: none !important; }

        .notion-scroller{
            overflow: hidden !important;
        }

        .notion-selectable-container > .notion-scroller { 
            overflow: visible !important; 
            height: auto !important;
        }
        /* 코드 텍스트 줄바꿈 강제 및 공백 유지 */
        .notion-code-block, .notion-code-block span {
            white-space: pre-wrap !important;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
        }
            

        
        .notion-app-inner, .notion-cursor-listener { height: auto !important; }
        
        ::-webkit-scrollbar { display: none !important; }

        .layout { padding-bottom: 0px !important; --margin-width: 0px !important; }

        .layout-content { padding-left: 100px !important; padding-right: 100px !important; }

    `;


    let dynamicStyles = hideStyles + freezeCSS;
    if (!includeTitle) dynamicStyles += `h1, .notion-page-block:has(h1) { display: none !important; }`;
    if (!includeBanner) dynamicStyles += `.notion-page-cover-wrapper, .notion-record-icon, .notion-page-controls { display: none !important; }`;
    if (!includeTags) dynamicStyles += `[aria-label="페이지 속성"], [aria-label="Page properties"] { display: none !important; }`;
    if (!includeDiscussion) dynamicStyles += `.layout-content-with-divider:has(.notion-page-view-discussion) { display: none !important;}`;

    const styleId = 'sn-pdf-style';
    let styleTag = document.getElementById(styleId);
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = styleId;
        document.head.appendChild(styleTag);
    }
    // 1. CSS 주입
    styleTag.innerHTML = dynamicStyles;

    const spans = document.querySelectorAll('span[data-token-index="0"]');
    spans.forEach(span => {
        let text = span.textContent;
        if (text.includes(" ")) text = text.replace(/ /g, '\u00A0');
        if (text.includes("\t")) text = text.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0');

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

    // 2. 브라우저 강제 리플로우(Reflow) 유발하여 CSS 즉시 적용
    // void document.body.offsetHeight;
    window.dispatchEvent(new Event('resize'));
    
    // 3. 다음 렌더링 프레임까지 대기하여 화면에 완전히 그려지도록 보장
    await new Promise(resolve => requestAnimationFrame(resolve));

    // 4. 화면 적용이 보장된 시점부터 3초 대기
    await new Promise(resolve => setTimeout(resolve, 3000));


    const selectors = ['.notion-page-content'];
    let contentHeight = 0;
    for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.height > contentHeight) contentHeight = rect.height;
        }
    }

    if (contentHeight < document.body.scrollHeight) contentHeight = document.body.scrollHeight;
    
    return { height: Math.ceil(contentHeight) + 100, width: Math.ceil(width)};
}








