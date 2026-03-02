const genericPool = require('generic-pool');
const puppeteer = require('puppeteer');
const logger = require('./logger');

const factory = {
    create: async function() {
        logger.info('Creating new Puppeteer browser instance for pool.');
        return await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--font-render-hinting=none',
                '--disable-extensions'
            ],
            timeout: 0
        });
    },
    destroy: async function(browser) {
        logger.info('Destroying Puppeteer browser instance.');
        await browser.close();
    }
};

const opts = {
    max: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
    min: 1,
    evictionRunIntervalMillis: 60000,
    idleTimeoutMillis: 300000
};

const browserPool = genericPool.createPool(factory, opts);

browserPool.on('factoryCreateError', (err) => {
    logger.error(`Browser pool creation error: ${err.message}`);
});

browserPool.on('factoryDestroyError', (err) => {
    logger.error(`Browser pool destruction error: ${err.message}`);
});

module.exports = browserPool;