#!/usr/bin/env bash
# Verification Script for Cached Data PDF Generation Implementation
# This script shows the key changes made to support private Notion page PDF generation using cached data

echo "=== CACHED DATA PDF GENERATION IMPLEMENTATION VERIFICATION ==="
echo ""

echo "1. CHECK: pdfService.js - Cache Retrieval Logic"
echo "   Looking for: async generatePdf(url, options, sessionId = null)"
grep -n "async generatePdf(url, options, sessionId" src/services/pdfService.js || echo "   ✗ NOT FOUND"

echo ""
echo "2. CHECK: pdfService.js - Redis Connection Import"
echo "   Looking for: const { connection } = require('../config/queue')"
grep -n "const { connection } = require('../config/queue')" src/services/pdfService.js || echo "   ✗ NOT FOUND"

echo ""
echo "3. CHECK: pdfService.js - Cache Detection in generatePdf"
echo "   Looking for: sessionKey = \`extension-session:"
grep -n "sessionKey = \`extension-session:" src/services/pdfService.js || echo "   ✗ NOT FOUND"

echo ""
echo "4. CHECK: pdfService.js - usesCachedData parameter in _setupBrowserPage"
echo "   Looking for: async _setupBrowserPage(page, usesCachedData = false)"
grep -n "async _setupBrowserPage(page, usesCachedData" src/services/pdfService.js || echo "   ✗ NOT FOUND"

echo ""
echo "5. CHECK: pdfService.js - localhost endpoint check in _navigateToPage"
echo "   Looking for: localhost.*render-cache"
grep -n "localhost.*render-cache" src/services/pdfService.js || echo "   ✗ NOT FOUND"

echo ""
echo "6. CHECK: pdf.js - /render-cache endpoint"
echo "   Looking for: router.get('/render-cache/:sessionId'"
grep -n "router.get('/render-cache/:sessionId'" src/routes/pdf.js || echo "   ✗ NOT FOUND"

echo ""
echo "7. CHECK: pdf.js - sessionId in convertSchema"
echo "   Looking for: sessionId: Joi.string().hex().length(24)"
grep -n "sessionId: Joi.string().hex().length(24)" src/routes/pdf.js || echo "   ✗ NOT FOUND"

echo ""
echo "8. CHECK: pdf.js - sessionId in queue job"
echo "   Looking for: sessionId: value.sessionId"
grep -n "sessionId: value.sessionId" src/routes/pdf.js || echo "   ✗ NOT FOUND"

echo ""
echo "9. CHECK: worker.js - sessionId extraction from job"
echo "   Looking for: const { targetUrl, options, sessionId }"
grep -n "const { targetUrl, options, sessionId }" src/worker.js || echo "   ✗ NOT FOUND"

echo ""
echo "10. CHECK: worker.js - Pass sessionId to generatePdf"
echo "    Looking for: pdfService.generatePdf(targetUrl, options, sessionId)"
grep -n "pdfService.generatePdf(targetUrl, options, sessionId)" src/worker.js || echo "   ✗ NOT FOUND"

echo ""
echo "11. CHECK: standard-edit-app.js - sessionId in PDF options"
echo "    Looking for: sessionId: this.sessionId"
grep -n "sessionId: this.sessionId" public/js/standard-edit-app.js || echo "   ✗ NOT FOUND"

echo ""
echo "12. CHECK: Test files created"
test -f tests/unit/pdfService.cachedSession.test.js && echo "   ✓ pdfService.cachedSession.test.js EXISTS" || echo "   ✗ pdfService.cachedSession.test.js NOT FOUND"
test -f tests/unit/pdfRoute.renderCache.test.js && echo "   ✓ pdfRoute.renderCache.test.js EXISTS" || echo "   ✗ pdfRoute.renderCache.test.js NOT FOUND"

echo ""
echo "=== IMPLEMENTATION SUMMARY ==="
echo ""
echo "Flow: Extension captures → sessionId returned → PDF request includes sessionId"
echo "      → Worker passes sessionId → generatePdf retrieves cache → Renders via /render-cache"
echo ""
echo "Key Feature: Private Notion pages can now be converted to PDF using cached data"
echo "             captured by the browser extension"
echo ""
echo "Error Handling: If cache expires or is missing, gracefully falls back to URL navigation"
echo ""
echo "=== TO TEST ==="
echo "1. Capture a private Notion page via extension"
echo "2. Click 'Generate PDF' button"
echo "3. Verify PDF is generated from cached data (not from URL)"
echo "4. Check that all resources load correctly"
echo ""
