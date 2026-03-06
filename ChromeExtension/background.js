// background.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "generate_pdf") {
        const tabId = request.tabId;
        const target = { tabId: tabId };

        chrome.debugger.attach(target, "1.3", async () => {
            try {
                // 1. 입력받은 너비로 뷰포트 강제 설정 (재배열 유도)
                // await chrome.debugger.sendCommand(target, "Emulation.setDeviceMetricsOverride", {
                //     width: request.width + 100,
                //     height: request.height,
                //     deviceScaleFactor: 1,
                //     mobile: false
                // });
                // await chrome.scripting.executeScript({
                //     target: { tabId: tabId },
                //     func: () => {
                //         const layout = document.querySelector('.layout');
                //         if (layout) {
                //             layout.style.setProperty('padding-bottom', '0px', 'important');
                //         }
                //         // 추가적으로 여백을 줄 수 있는 요소들 방어
                //         const pageContent = document.querySelector('.notion-page-content');
                //         if (pageContent) {
                //             pageContent.style.setProperty('padding-bottom', '0px', '!important');
                //         }
                //     }
                // });

                // 레이아웃 재계산을 위한 짧은 대기
                // await new Promise(r => setTimeout(r, 2000));

                // 2. PDF 생성 옵션
                const printOptions = {
                    paperWidth: request.width / 96 + 200/96, // 1인치 = 72포인트 기준으로 변환
                    paperHeight: request.height / 96,
                    printBackground: true,
                    pageRanges: "1",
                    preferCSSPageSize: false,
                    marginTop: 0,
                    marginBottom: 0,
                    marginLeft: 0,
                    marginRight: 0,
                    
                    
                };


                const result = await chrome.debugger.sendCommand(target, "Page.printToPDF", printOptions);
                
                // 3. 뷰포트 복원 및 디버거 해제
                await chrome.debugger.sendCommand(target, "Emulation.clearDeviceMetricsOverride");
                
                chrome.debugger.detach(target);

                // 4. 주입된 스타일 제거 및 노션 UI 복원
                chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    func: cleanupNotionPage
                });

                // 5. 다운로드 실행
                const dataUrl = `data:application/pdf;base64,${result.data}`;
                chrome.downloads.download({
                    url: dataUrl,
                    filename: `notion_export_${Date.now()}.pdf`
                });

                sendResponse({ success: true });
            } catch (err) {
                console.error(err);
                chrome.debugger.detach(target);
                sendResponse({ success: false, error: err.message });
            }
        });
        return true;
    }
});

function cleanupNotionPage() {
    // 1. 주입했던 스타일 태그 제거
    const styleId = 'sn-pdf-style';
    const styleTag = document.getElementById(styleId);
    if (styleTag) styleTag.remove();

    // 2. 노션의 특정 스크롤러 요소에 대해 overflow 다시 활성화
    const mainScroller = document.querySelector('.notion-selectable-container > .notion-scroller');
    if (mainScroller) {
        mainScroller.style.setProperty('overflow', 'auto', 'important');
        mainScroller.style.setProperty('height', '100%', 'important');
    }

    // 3. 브라우저에 리사이즈 이벤트를 발생시켜 레이아웃 재계산 유도
    window.dispatchEvent(new Event('resize'));
    
    console.log("Single Notion: 강력한 스크롤 복구 로직 실행 완료");
}