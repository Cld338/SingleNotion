/**
 * Popup Script - Handles UI interactions
 */

// 서버 URL 설정 - 개발환경과 프로덕션 환경 모두 지원
const CONFIG = {
    SERVER_URL: 'http://localhost:3001', // 테스트 환경
    // SERVER_URL: 'https://notion-pdf.cld338.me', // 프로덕션 환경
};

// 디버깅 로그 저장
class ExtensionLogger {
    static log(message, type = 'info', data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, type, message, data };
        
        console.log(`[Notion-PDF ${type.toUpperCase()}]`, message, data);
        
        // localStorage에 저장
        try {
            let logs = JSON.parse(localStorage.getItem('extension-logs') || '[]');
            logs.push(logEntry);
            // 최대 100개만 저장
            if (logs.length > 100) {
                logs = logs.slice(-100);
            }
            localStorage.setItem('extension-logs', JSON.stringify(logs));
            // 디버그 표시 업데이트
            updateDebugDisplay();
        } catch (e) {
            console.error('Failed to save log to localStorage:', e);
        }
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

// 개발자 모드에서 서버 URL을 콘솔에 출력
console.log('[Notion-PDF] Server URL:', CONFIG.SERVER_URL);

const Elements = {
    captureBtn: document.getElementById('capture-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    statusBox: document.getElementById('status-box'),
    debugLogs: document.getElementById('debug-logs'),
};

/**
 * Update debug logs display
 */
function updateDebugDisplay() {
    if (!Elements.debugLogs) return;
    
    try {
        const logs = JSON.parse(localStorage.getItem('extension-logs') || '[]');
        const recentLogs = logs.slice(-10); // 최근 10개만
        
        const logText = recentLogs.map(log => 
            `[${log.type.toUpperCase()}] ${log.message}${log.data ? '\n  ' + JSON.stringify(log.data) : ''}`
        ).join('\n');
        
        Elements.debugLogs.textContent = logText || '(로그 없음)';
    } catch (e) {
        console.error('Failed to update debug display:', e);
    }
}

/**
 * Show status message
 */
function showStatus(message, type = 'info') {
    Elements.statusBox.className = `status-box ${type}`;
    
    const iconMap = {
        info: '⏳',
        success: '✓',
        error: '✕'
    };
    
    if (type === 'info') {
        Elements.statusBox.innerHTML = `<div class="spinner"></div> <span>${message}</span>`;
    } else {
        Elements.statusBox.innerHTML = `<span>${iconMap[type]} ${message}</span>`;
    }
    
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

        // 캡처된 데이터 검증
        if (!capturedData) {
            throw new Error('캡처 데이터가 없습니다.');
        }
        
        if (!capturedData.html || typeof capturedData.html !== 'string') {
            throw new Error(`HTML이 유효하지 않습니다: ${typeof capturedData.html}`);
        }
        
        if (!capturedData.resources || typeof capturedData.resources !== 'object') {
            ExtensionLogger.warn('Resources invalid, setting empty object');
            capturedData.resources = { cssLinks: [], inlineStyles: [] };
        }
        
        // Ensure resources has proper arrays
        if (!Array.isArray(capturedData.resources.cssLinks)) {
            console.warn('[Notion-PDF] cssLinks is not an array in sendToServer');
            capturedData.resources.cssLinks = [];
        }
        
        if (!Array.isArray(capturedData.resources.inlineStyles)) {
            console.warn('[Notion-PDF] inlineStyles is not an array in sendToServer');
            capturedData.resources.inlineStyles = [];
        }
        
        if (!capturedData.metadata || typeof capturedData.metadata !== 'object') {
            throw new Error('메타데이터가 유효하지 않습니다.');
        }
        
        if (!capturedData.metadata.timestamp) {
            capturedData.metadata.timestamp = new Date().toISOString();
        }

        ExtensionLogger.info('Sending captured data to server', {
            htmlSize: capturedData.html.length,
            detectedWidth: capturedData.detectedWidth,
            cssLinks: capturedData.resources.cssLinks.length,
            inlineStyles: capturedData.resources.inlineStyles.length,
            metadata: capturedData.metadata
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

        ExtensionLogger.info('POST response received', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });

        if (!response.ok) {
            let errorData = {};
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { text: await response.text() };
            }
            throw new Error(`Server error ${response.status}: ${errorData.error || JSON.stringify(errorData)}`);
        }

        const result = await response.json();
        
        ExtensionLogger.success('Server response received', result);
        
        if (!result.sessionId) {
            throw new Error('세션 ID를 받지 못했습니다. 서버에서 세션이 생성되지 않았을 수 있습니다.');
        }
        
        ExtensionLogger.success('Session ID received', { sessionId: result.sessionId });
        
        showStatus('✓ 전송 완료! 편집 페이지로 이동합니다.', 'success');
        
        // Close popup after 1 second and open editor
        setTimeout(() => {
            const editorUrl = `${CONFIG.SERVER_URL}/standard-edit?sessionId=${result.sessionId}&source=extension`;
            console.log('[Notion-PDF] Opening editor with URL:', editorUrl);
            chrome.tabs.create({ url: editorUrl });
            window.close();
        }, 1000);

    } catch (error) {
        ExtensionLogger.error('Send error', error);
        showStatus(`오류: ${error.message}`, 'error');
    }
}

/**
 * Handle capture button click
 */
async function handleCapture() {
    try {
        // Get current tab
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab.url.includes('notion.so') && !tab.url.includes('notion.site')) {
            ExtensionLogger.warn('Non-Notion page');
            showStatus('Notion 페이지에서만 실행 가능합니다.', 'error');
            return;
        }

        ExtensionLogger.info('Capture started', { url: tab.url });
        showStatus('페이지 캡처 중...', 'info');
        Elements.captureBtn.disabled = true;

        // Send message to content script
        chrome.tabs.sendMessage(tab.id, { action: 'captureContent' }, (response) => {
            Elements.captureBtn.disabled = false;

            if (chrome.runtime.lastError) {
                ExtensionLogger.error('Chrome API error', chrome.runtime.lastError);
                
                // Content script might not be loaded yet
                if (chrome.runtime.lastError.message.includes('Could not establish connection')) {
                    ExtensionLogger.warn('Content script not loaded');
                    showStatus('콘텐츠 스크립트가 로드되지 않았습니다. 페이지를 새로고침하세요.', 'error');
                } else {
                    ExtensionLogger.error('Content script error', chrome.runtime.lastError.message);
                    showStatus(`콘텐츠 스크립트 오류: ${chrome.runtime.lastError.message}`, 'error');
                }
                return;
            }

            if (!response) {
                ExtensionLogger.error('No response from content script');
                showStatus('페이지에서 응답이 없습니다. 페이지를 새로고침하세요.', 'error');
                return;
            }

            if (!response.success) {
                const error = response?.error || '알 수 없는 오류';
                ExtensionLogger.error('Capture failed', error);
                showStatus(`캡처 실패: ${error}`, 'error');
                return;
            }

            // 캡처된 데이터 검증
            if (!response.data) {
                throw new Error('캡처된 데이터가 없습니다.');
            }
            
            if (!response.data.html) {
                throw new Error('HTML 데이터가 없습니다.');
            }
            
            if (!response.data.resources) {
                console.warn('[Notion-PDF] Resources missing, initializing...');
                response.data.resources = { cssLinks: [], inlineStyles: [] };
            }
            
            if (!Array.isArray(response.data.resources.cssLinks)) {
                console.warn('[Notion-PDF] cssLinks is not an array, resetting...');
                response.data.resources.cssLinks = [];
            }
            
            if (!Array.isArray(response.data.resources.inlineStyles)) {
                console.warn('[Notion-PDF] inlineStyles is not an array, resetting...');
                response.data.resources.inlineStyles = [];
            }

            ExtensionLogger.success('Capture successful', {
                htmlSize: response.data.html.length || 0,
                cssLinks: response.data.resources.cssLinks.length || 0,
                inlineStyles: response.data.resources.inlineStyles.length || 0
            });

            // Send to server
            sendToServer(response.data);
        });

    } catch (error) {
        ExtensionLogger.error('Capture error', error);
        showStatus(`오류: ${error.message}`, 'error');
        Elements.captureBtn.disabled = false;
    }
}

/**
 * Handle settings button click
 */
function handleSettings() {
    // TODO: Implement settings page
    showStatus('설정은 추후 추가됩니다.', 'info');
    setTimeout(hideStatus, 3000);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    Elements.captureBtn.addEventListener('click', handleCapture);
    Elements.settingsBtn.addEventListener('click', handleSettings);
    
    // 초기 디버그 로그 표시
    updateDebugDisplay();
    
    // 주기적으로 디버그 로그 업데이트 (1초마다)
    setInterval(updateDebugDisplay, 1000);
});
