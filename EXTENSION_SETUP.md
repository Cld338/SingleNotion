# Quick Start Guide - Chrome Extension Implementation

## 🎯 What Was Implemented

Your Notion PDF converter now supports a **Chrome Extension** that enables instant, direct conversion without server-side rendering delays.

### Architecture

```
Notion Page
    ↓
Chrome Extension (Capture DOM + Images)
    ↓
POST /render-from-extension (Server)
    ↓
Redis Session Storage (1 hour TTL)
    ↓
Redirect to /standard-edit?sessionId=...
    ↓
Frontend loads from /session-data/:sessionId
    ↓
Edit & Generate PDF
```

## 📁 Files Created

```
extension/
├── manifest.json       # Chrome Extension configuration (Manifest V3)
├── content.js         # DOM capture and image conversion
├── popup.html         # Simple UI with capture button
├── popup.js           # Popup logic and server communication
├── background.js      # Service worker (lifecycle management)
├── README.md          # Installation & usage guide
└── TESTING.md         # Comprehensive test scenarios
```

## 🚀 Quick Setup (5 minutes)

### 1. Start the Server

```bash
# Terminal 1: Backend
cd c:\workspace\notion-pdf\SinglePagedNotionPDF
npm start

# Expected output:
# > pdf-converter-prod@1.0.0 start
# Server running on port 3000
# Connected to Redis
```

### 2. Verify Redis is Running

```bash
# Terminal 2: Redis (Docker recommended)
docker-compose up redis

# Or local Redis:
redis-server
```

### 3. Load Chrome Extension

1. Open Chrome / Edge
2. Go to: `chrome://extensions` (or `edge://extensions`)
3. Toggle **"Developer mode"** (top-right)
4. Click **"Load unpacked"**
5. Select: `c:\workspace\notion-pdf\SinglePagedNotionPDF\extension`

You should see: **"Notion to PDF - Direct Convert"** in your extensions list

### 4. Test It!

1. Open a **Notion page** (any page on notion.so or notion.site)
2. Click the **extension icon** in your browser
3. Click **"캡처 & 전송"** (Capture & Send)
4. Watch the browser redirect to the editor page
5. Click **"PDF 다운로드"** to get your PDF

**Total time: ~3-5 seconds** (vs. 30+ seconds with URL-based approach)

## 🔧 Server Endpoints Added

### POST `/render-from-extension`
Receives captured page data from extension

```bash
curl -X POST https://notion-pdf.cld338.me/render-from-extension \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<html>...</html>",
    "resources": {
      "cssLinks": ["https://..."],
      "inlineStyles": ["body { ... }"]
    },
    "metadata": {
      "url": "https://www.notion.so/...",
      "title": "Page Title",
      "timestamp": "2026-03-17T..."
    }
  }'

# Response:
# {
#   "success": true,
#   "sessionId": "a1b2c3d4e5f6...",
#   "message": "데이터가 저장되었습니다."
# }
```

### GET `/session-data/:sessionId`
Retrieves stored session data

```bash
curl https://notion-pdf.cld338.me/session-data/a1b2c3d4e5f6...

# Response:
# {
#   "html": "<html>...</html>",
#   "detectedWidth": 1080,
#   "resources": { ... },
#   "metadata": { ... },
#   "source": "extension"
# }
```

## 📊 Data Flow

### URL-Based (Original)
```
Notion URL → Puppeteer renders → Browser downloads preview → Edit → PDF
Duration: 30-60 seconds
```

### Extension-Based (New - MVP)
```
Notion Page → Extension captures → Server stores → Browser edits → PDF
Duration: 3-5 seconds
```

## 🎨 Frontend Changes

### Modified: `standard-edit-app.js`

Now supports two source types:
- **URL source**: `/preview-html?url=...` (existing)
- **Extension source**: `/session-data/:sessionId` (new)

The app automatically detects the source and loads accordingly:

```javascript
// Constructor now handles sessionId
this.sessionId = params.get('sessionId');
this.source = params.get('source') || 'url';

// init() method chooses the correct endpoint
if (this.sessionId) {
    requestUrl = `/session-data/${this.sessionId}`;
} else if (this.notionUrl) {
    requestUrl = `/preview-html?url=${encodeURIComponent(this.notionUrl)}...`;
}
```

## 🧪 Testing Checklist

Complete the tests in order:

```
□ Extension loaded in chrome://extensions
□ Notion page shows extension popup
□ "캡처 & 전송" button is clickable
□ Console shows [Notion-PDF] capture logs
□ Server logs show session saved
□ Auto-redirect to /standard-edit?sessionId=...
□ Editor page loads content successfully
□ PDF download works
□ PDF displays correctly
□ Invalid sessionId shows error
□ Large pages handle without timeout
```

See `extension/TESTING.md` for detailed test scenarios.

## 🐛 Troubleshooting

| Problem | Solution |
|---------|----------|
| "Content script error" | Refresh Notion page, extension may need reload |
| "Cannot connect to server" | Check server is running: `npm start` |
| Images not loading | Check CORS in Network tab, may need canvas workaround |
| "Session not found" | Session expired (1 hour TTL) - recapture page |
| Popup not showing on Notion | Clear extension cache or reinstall |

For more help: See `extension/README.md` problem section

## 📝 Configuration

### Server URL (Development)

In `extension/popup.js`:

```javascript
const CONFIG = {
    SERVER_URL: 'https://notion-pdf.cld338.me', // Change for production
};
```

### Session TTL

In `src/routes/pdf.js`:

```javascript
await redisConnection.setex(
    `session:${sessionId}`,
    3600,  // 1 hour - adjust as needed
    JSON.stringify(sessionData)
);
```

### Rate Limiting

In `src/routes/pdf.js`:

```javascript
const extensionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,  // Max 20 requests per 15 minutes
});
```

## 🚢 Production Deployment

When deploying to production:

1. **Update manifest.json** to use production domain
2. **Update popup.js** SERVER_URL to production URL
3. **Configure CORS** if frontend and backend are separate domains
4. **Set environment variables**:
   ```bash
   REDIS_HOST=production-redis-host
   REDIS_PORT=6379
   ```
5. **Publish to Chrome Web Store** (optional)

## 📚 Documentation

- **Setup**: `extension/README.md` - Installation and usage
- **Testing**: `extension/TESTING.md` - End-to-end test scenarios
- **API**: See inline comments in `src/routes/pdf.js`

## 🎓 Next Steps (Phase 2)

- [ ] Add Firefox support (Manifest V2)
- [ ] Create settings/options page
- [ ] Add image compression options
- [ ] Implement batch conversion
- [ ] Add cloud storage integration
- [ ] Chrome Web Store submission

## 💡 Key Design Decisions

1. **Manifest V3**: Latest standard, better security
2. **Base64 images**: Works offline, no CDN dependency
3. **Redis sessions**: TTL prevents storage overflow
4. **Minimal UI**: MVP approach - faster iteration
5. **Rate limiting**: Prevents abuse
6. **Error messages**: User-friendly, actionable

## 🔒 Security Features

✅ Scripts removed from captured HTML
✅ Event handlers stripped for safety
✅ HTML size limited (10MB)
✅ Session uniqueness (crypto.randomBytes)
✅ TTL prevents session leakage
✅ Input validation on all endpoints
✅ Rate limiting per IP

## 📞 Support

For issues or questions:
1. Check `extension/TESTING.md` for your scenario
2. Review browser console logs
3. Check server logs in terminal
4. Enable DevTools Network tab to trace requests

---

**Version**: 0.1.0 (MVP)
**Status**: ✅ Ready for Testing
**Last Updated**: 2026-03-17

Launch the server and try it now! 🚀
