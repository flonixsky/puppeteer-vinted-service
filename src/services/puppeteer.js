const puppeteer = require('puppeteer');
const logger = require('../utils/logger');

class PuppeteerService {
  constructor() {
    this.browser = null;
    this.defaultTimeout = parseInt(process.env.PUPPETEER_TIMEOUT) || 30000;
  }

  // ========================================
  // BROWSER MANAGEMENT
  // ========================================

  async launchBrowser() {
    try {
      logger.info('Launching Puppeteer browser...');

      this.browser = await puppeteer.launch({
        headless: process.env.PUPPETEER_HEADLESS === 'true',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--window-size=1920,1080'
        ],
        defaultViewport: {
          width: 1920,
          height: 1080
        }
      });

      logger.info('Browser launched successfully');
      return this.browser;
    } catch (error) {
      logger.error('Failed to launch browser', { error: error.message });
      throw error;
    }
  }

  async createPage(userAgent = null) {
    try {
      if (!this.browser) {
        await this.launchBrowser();
      }

      const page = await this.browser.newPage();

      // Set User Agent
      const ua = userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      await page.setUserAgent(ua);

      // Anti-Detection: Remove webdriver flag
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { 
          get: () => [1, 2, 3, 4, 5] 
        });
        window.chrome = { runtime: {} };
      });

      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
      });

      logger.info('New page created');
      return page;
    } catch (error) {
      logger.error('Failed to create page', { error: error.message });
      throw error;
    }
  }

  async closeBrowser() {
    try {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        logger.info('Browser closed');
      }
    } catch (error) {
      logger.error('Error closing browser', { error: error.message });
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  async takeScreenshot(page, encoding = 'base64') {
    try {
      const screenshot = await page.screenshot({
        encoding: encoding,
        fullPage: false
      });
      logger.info('Screenshot taken');
      return screenshot;
    } catch (error) {
      logger.error('Failed to take screenshot', { error: error.message });
      return null;
    }
  }

  async randomDelay(min = 500, max = 2000) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    logger.debug(`Waiting ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  async humanType(page, selector, text, options = {}) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      
      // Random delay before typing
      await this.randomDelay(300, 800);
      
      // Type with human-like delay between keystrokes
      const delay = options.delay || this.randomBetween(50, 150);
      await page.type(selector, text, { delay });
      
      logger.debug(`Typed into ${selector}`);
      return true;
    } catch (error) {
      logger.error(`Failed to type into ${selector}`, { error: error.message });
      return false;
    }
  }

  async humanClick(page, selector) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      
      // Random delay before clicking
      await this.randomDelay(300, 800);
      
      await page.click(selector);
      
      logger.debug(`Clicked ${selector}`);
      return true;
    } catch (error) {
      logger.error(`Failed to click ${selector}`, { error: error.message });
      return false;
    }
  }

  randomBetween(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  async waitForNavigation(page, timeout = 30000) {
    try {
      await page.waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: timeout
      });
      return true;
    } catch (error) {
      logger.error('Navigation timeout', { error: error.message });
      return false;
    }
  }

  // ========================================
  // COOKIE MANAGEMENT
  // ========================================

  async setCookies(page, cookies) {
    try {
      if (!cookies || !Array.isArray(cookies)) {
        logger.warn('Invalid cookies provided');
        return false;
      }

      await page.setCookie(...cookies);
      logger.info(`Set ${cookies.length} cookies`);
      return true;
    } catch (error) {
      logger.error('Failed to set cookies', { error: error.message });
      return false;
    }
  }

  async getCookies(page) {
    try {
      const cookies = await page.cookies();
      logger.info(`Retrieved ${cookies.length} cookies`);
      return cookies;
    } catch (error) {
      logger.error('Failed to get cookies', { error: error.message });
      return [];
    }
  }
}

module.exports = new PuppeteerService();
