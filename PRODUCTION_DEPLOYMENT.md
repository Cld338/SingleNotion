# Production Deployment Guide

## Server Configuration

### 1. Update Extension Server URL

In `extension/popup.js`, update CONFIG to production URL:

```javascript
const CONFIG = {
    SERVER_URL: 'https://notion-pdf.cld338.me', // Your production domain
};
```

### 2. HTTPS/SSL Configuration

Ensure your server (notion-pdf.cld338.me) has:
- ✅ Valid SSL certificate
- ✅ HTTPS enabled
- ✅ Proper CORS headers if needed

## Known Limitations & Workarounds

### 📌 CORS Restriction on Notion Images

**Issue**: Notion's CDN (img.notionusercontent.com) blocks image access from extensions due to CORS policy

**Current Implementation**:
- ✅ Attempts to convert images to base64
- ✅ If CORS blocks conversion, **keeps original URL as fallback**
- ✅ All images ultimately appear in the document

**Result**: Images display correctly using original URLs

### Console Messages (Expected - Not Errors)

```
[Notion-PDF] Image load failed (CORS or network), keeping original URL: https://...
```

This is **normal behavior** - the extension is gracefully handling Notion's CORS restrictions.

---

## Testing Before Production

### 1. Test with Real Notion Pages

```bash
# Start server
npm start

# Test with various page types:
# □ Page with images
# □ Page with tables
# □ Page with embedded content
# □ Page with databases
# □ Page with different languages (Korean, etc.)
```

### 2. Verify Image Handling

When capturing a Notion page:

```
Expected behavior:
  ✅ All images appear in preview
  ⚠️  Some show CORS warnings in console (normal)
  ✅ PDF output contains all images
  ✅ Image quality preserved
```

### 3. Test PDF Output Quality

```
Verify in generated PDF:
  ✅ Images display correctly
  ✅ Text is readable
  ✅ Layout matches preview
  ✅ No blank image spaces
```

---

## Deployment Checklist

```
□ Extension SERVER_URL updated to production domain
□ Server running on production domain (notion-pdf.cld338.me)
□ HTTPS/SSL certificate valid
□ Redis configured and running
□ Rate limiting active
□ Error logging configured
□ Session TTL appropriate (default 1 hour)
□ Firewall allows port 443 (HTTPS)
□ CORS headers configured if needed
□ Database backups configured
□ Monitoring/alerts set up
```

---

## CORS Technical Details

### Why Notion Images Have CORS Issues

Notion serves images from `img.notionusercontent.com` with:
- ❌ No `Access-Control-Allow-Origin` header
- ✅ Signed URLs with time-based expiration
- ✅ IP-based access restrictions

### Our Solution

Instead of failing on CORS-blocked images:

1. **Attempt conversion**: Try to convert to base64 with `crossOrigin="anonymous"`
2. **Graceful fallback**: If fails, keep original URL
3. **Final result**: Image appears via original URL (not base64)

**Advantages**:
- ✅ All images display
- ✅ No conversion failures
- ✅ Original image quality preserved
- ✅ Transparent to user

**Trade-offs**:
- ⚠️ Some images kept as URLs (not base64)
- ⚠️ Original URLs may expire after 1 hour
- ⚠️ Offline mode won't show original URLs

---

## Monitoring & Troubleshooting

### Server Logs to Monitor

```
# Look for these in server logs:
"Extension data stored - SessionId: ..."
"Session data retrieved - SessionId: ..."
"Failed to process extension data: ..."
```

### Common Production Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| CORS errors in browser | Notion CDN blocks access | Expected - images still display via URLs |
| Images don't show in PDF | Expired signed URLs | Regenerate from fresh Notion page |
| Session not found | > 1 hour old | User must recapture page |
| Slow performance | High server load | Check Redis, scale horizontally |
| Large data rejections | > 10MB HTML | Simplify Notion page (fewer images) |

---

## Performance Tuning

### Optimize for Production

```javascript
// src/routes/pdf.js
// Adjust session TTL based on usage
await redisConnection.setex(
    `session:${sessionId}`,
    3600,  // 1 hour - appropriate for most use cases
    JSON.stringify(sessionData)
);

// Adjust rate limits
const extensionLimiter = rateLimit({
    max: 20,  // requests per window
    windowMs: 15 * 60 * 1000, // 15 minutes
});
```

### Redis Configuration

For production, ensure Redis is:
- ✅ Running in daemon mode
- ✅ Persistence enabled (RDB or AOF)
- ✅ Memory limit set
- ✅ Eviction policy configured

```bash
# Check Redis config
redis-cli CONFIG GET maxmemory
redis-cli CONFIG GET maxmemory-policy
```

---

## Rollback Plan

If issues occur:

1. **Stop serving**
   ```bash
   npm stop
   ```

2. **Revert code**
   ```bash
   git checkout HEAD -- src/routes/pdf.js
   ```

3. **Clear Redis sessions** (optional)
   ```bash
   redis-cli FLUSHDB
   ```

4. **Restart**
   ```bash
   npm start
   ```

---

## Update Process for Future Versions

### To Update Extension

1. Edit extension files locally
2. Reload in Chrome: `chrome://extensions` → Reload button
3. Test thoroughly
4. When ready for production, update code and redeploy

### To Update Server

```bash
# Pull latest code
git pull

# Install any new dependencies
npm install

# Restart server
npm stop
npm start
```

---

## Support Contact

For production issues:
- Check [extension/README.md](./extension/README.md) troubleshooting
- Review [TESTING.md](./extension/TESTING.md) test scenarios
- Check server logs: `npm start` terminal output
- Review browser console: F12 > Console tab

---

**Version**: 0.1.0 (MVP)
**Status**: Production Ready
**Last Updated**: 2026-03-17
