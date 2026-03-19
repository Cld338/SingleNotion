/**
 * Popup Script - Handles UI interactions
 */

// 서버 URL 설정
const CONFIG = {
    // SERVER_URL: 'http://localhost:3001', // 테스트 환경
    SERVER_URL: 'https://notion-pdf.cld338.me', // 프로덕션 환경
};

// 단순화된 로거 (콘솔 출력 전용)
class ExtensionLogger {
    static log(message, type = 'info', data = null) {
        console.log(`[Notion-PDF ${type.toUpperCase()}]`, message, data);
    }
    
    static error(message, error = null) {
        this.log(message, 'error', error?.message || error);
    }
    
    static warn(message, data = null) {
        this.log(message, 'warn', data);
    }
    
    static info(message, data = null) {
        this.log(message, 'info', data);
    }
    
    static success(message, data = null) {
        this.log(message, 'success', data);
    }
}

console.log('[Notion-PDF] Server URL:', CONFIG.SERVER_URL);

const Elements = {
    captureBtn: document.getElementById('capture-btn'),
    statusBox: document.getElementById('status-box'),
};

let originalBtnContent = '';

/**
 * Show status message with SVG icons
 */
function showStatus(message, type = 'info') {
    Elements.statusBox.className = `status-box ${type}`;
    
    let iconHtml = '';
    if (type === 'info') {
        iconHtml = '<div class="spinner"></div>';
    } else if (type === 'success') {
        iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else if (type === 'error') {
        iconHtml = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    }
    
    Elements.statusBox.innerHTML = `${iconHtml} <span>${message}</span>`;
    Elements.statusBox.style.display = 'flex';
}

/**
 * Hide status message
 */
function hideStatus() {
    Elements.statusBox.style.display = 'none';
}

/**
 * Send captured data to server
 */
async function sendToServer(capturedData) {
    try {
        showStatus('서버에 전송 중...', 'info');

        if (!capturedData || !capturedData.html || typeof capturedData.html !== 'string') {
            throw new Error('유효하지 않은 캡처 데이터입니다.');
        }
        
        if (!capturedData.resources || typeof capturedData.resources !== 'object') {
            capturedData.resources = { cssLinks: [], inlineStyles: [] };
        }
        
        if (!Array.isArray(capturedData.resources.cssLinks)) capturedData.resources.cssLinks = [];
        if (!Array.isArray(capturedData.resources.inlineStyles)) capturedData.resources.inlineStyles = [];
        if (!capturedData.metadata) capturedData.metadata = {};
        if (!capturedData.metadata.timestamp) capturedData.metadata.timestamp = new Date().toISOString();

        ExtensionLogger.info('Sending captured data to server', {
            htmlSize: capturedData.html.length,
            detectedWidth: capturedData.detectedWidth,
        });

        const response = await fetch(`${CONFIG.SERVER_URL}/render-from-extension`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                html: capturedData.html,
                detectedWidth: capturedData.detectedWidth,
                resources: capturedData.resources,
                metadata: capturedData.metadata,
            }),
        });

        if (!response.ok) {
            let errorData = {};
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { text: await response.text() };
            }
            throw new Error(`서버 오류 ${response.status}: ${errorData.error || JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        
        if (!result.sessionId) {
            throw new Error('세션 ID를 받지 못했습니다.');
        }
        
        showStatus('전송 완료! 편집 페이지로 이동합니다.', 'success');
        Elements.captureBtn.innerHTML = originalBtnContent;
        
        setTimeout(() => {
            const editorUrl = `${CONFIG.SERVER_URL}/standard-edit?sessionId=${result.sessionId}&source=extension`;
            chrome.tabs.create({ url: editorUrl });
            window.close();
        }, 1000);

    } catch (error) {
        ExtensionLogger.error('Send error', error);
        showStatus(`오류: ${error.message}`, 'error');
        Elements.captureBtn.disabled = false;
        Elements.captureBtn.innerHTML = originalBtnContent;
    }
}

/**
 * Handle capture button click
 */
async function handleCapture() {
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab.url.includes('notion.so') && !tab.url.includes('notion.site')) {
            showStatus('Notion 페이지에서만 실행 가능합니다.', 'error');
            return;
        }

        showStatus('페이지 캡처 중...', 'info');
        
        originalBtnContent = Elements.captureBtn.innerHTML;
        Elements.captureBtn.disabled = true;
        // 버튼 내 스피너 제거
        Elements.captureBtn.innerHTML = '<span>처리 중...</span>';

        chrome.tabs.sendMessage(tab.id, { action: 'captureContent' }, (response) => {
            if (chrome.runtime.lastError) {
                Elements.captureBtn.disabled = false;
                Elements.captureBtn.innerHTML = originalBtnContent;
                
                if (chrome.runtime.lastError.message.includes('Could not establish connection')) {
                    showStatus('콘텐츠 스크립트가 로드되지 않았습니다. 페이지를 새로고침하세요.', 'error');
                } else {
                    showStatus(`오류: ${chrome.runtime.lastError.message}`, 'error');
                }
                return;
            }

            if (!response || !response.success || !response.data) {
                Elements.captureBtn.disabled = false;
                Elements.captureBtn.innerHTML = originalBtnContent;
                const errorMsg = response?.error || '알 수 없는 오류';
                showStatus(`캡처 실패: ${errorMsg}`, 'error');
                return;
            }

            sendToServer(response.data);
        });

    } catch (error) {
        ExtensionLogger.error('Capture error', error);
        showStatus(`오류: ${error.message}`, 'error');
        Elements.captureBtn.disabled = false;
        if(originalBtnContent) Elements.captureBtn.innerHTML = originalBtnContent;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    Elements.captureBtn.addEventListener('click', handleCapture);
});