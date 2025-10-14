const { chromium } = require('playwright');
const logger = require('../utils/logger');

class PlaywrightService {
  constructor() {
    this.browser = null;
    this.context = null;
    this.defaultTimeout = parseInt(process.env.PUPPETEER_TIMEOUT) || 30000;
  }

  // ========================================
  // BROWSER MANAGEMENT
  // ========================================

  async launchBrowser() {
    try {
      logger.info('Launching Playwright browser...');

      this.browser = await chromium.launch({
        headless: process.env.PUPPETEER_HEADLESS === 'true',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-dev-shm-usage',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });

      // Create a persistent context with viewport and user agent
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      
      this.context = await this.browser.newContext({
        viewport: {
          width: 1920,
          height: 1080
        },
        userAgent: ua,
        locale: 'de-DE',
        timezoneId: 'Europe/Berlin',
        permissions: [],
        // Anti-detection settings
        bypassCSP: true,
        ignoreHTTPSErrors: true
      });

      // Inject anti-detection scripts
      await this.context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        Object.defineProperty(navigator, 'plugins', { 
          get: () => [1, 2, 3, 4, 5] 
        });
        window.chrome = { runtime: {} };
      });

      logger.info('Browser and context launched successfully');
      return this.browser;
    } catch (error) {
      logger.error('Failed to launch browser', { error: error.message });
      throw error;
    }
  }

  async createPage(userAgent = null) {
    try {
      if (!this.browser || !this.context) {
        await this.launchBrowser();
      }

      const page = await this.context.newPage();

      // Set custom user agent if provided
      if (userAgent) {
        await page.setExtraHTTPHeaders({
          'User-Agent': userAgent
        });
      }

      // Set extra headers
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7'
      });

      // Set default timeout
      page.setDefaultTimeout(this.defaultTimeout);

      logger.info('New page created');
      return page;
    } catch (error) {
      logger.error('Failed to create page', { error: error.message });
      throw error;
    }
  }

  async closeBrowser() {
    try {
      if (this.context) {
        await this.context.close();
        this.context = null;
      }
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
        type: 'png',
        fullPage: false
      });
      
      if (encoding === 'base64') {
        logger.info('Screenshot taken (base64)');
        return screenshot.toString('base64');
      }
      
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
      // Playwright auto-waits for elements
      const element = page.locator(selector).first();
      await element.waitFor({ state: 'visible', timeout: 5000 });
      
      // Random delay before typing
      await this.randomDelay(300, 800);
      
      // Clear existing text first
      await element.clear();
      
      // Type with human-like delay between keystrokes
      const delay = options.delay || this.randomBetween(50, 150);
      await element.pressSequentially(text, { delay });
      
      logger.debug(`Typed into ${selector}`);
      return true;
    } catch (error) {
      logger.error(`Failed to type into ${selector}`, { error: error.message });
      return false;
    }
  }

  async humanClick(page, selector) {
    try {
      // Playwright auto-waits for elements
      const element = page.locator(selector).first();
      await element.waitFor({ state: 'visible', timeout: 5000 });
      
      // Random delay before clicking
      await this.randomDelay(300, 800);
      
      await element.click();
      
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
      await page.waitForLoadState('networkidle', { timeout });
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

      // Convert Puppeteer cookie format to Playwright format if needed
      const playwrightCookies = cookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        expires: cookie.expires || -1,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite || 'Lax'
      }));

      await this.context.addCookies(playwrightCookies);
      logger.info(`Set ${cookies.length} cookies`);
      return true;
    } catch (error) {
      logger.error('Failed to set cookies', { error: error.message });
      return false;
    }
  }

  async getCookies(page) {
    try {
      const cookies = await this.context.cookies();
      logger.info(`Retrieved ${cookies.length} cookies`);
      return cookies;
    } catch (error) {
      logger.error('Failed to get cookies', { error: error.message });
      return [];
    }
  }

  // ========================================
  // PLAYWRIGHT-SPECIFIC HELPERS
  // ========================================

  /**
   * Better way to find elements by text content
   */
  async clickByText(page, text, options = {}) {
    try {
      await this.randomDelay(300, 800);
      await page.getByText(text, options).first().click();
      logger.debug(`Clicked element with text: ${text}`);
      return true;
    } catch (error) {
      logger.error(`Failed to click element with text: ${text}`, { error: error.message });
      return false;
    }
  }

  /**
   * Find element by role (better for accessibility)
   */
  async clickByRole(page, role, options = {}) {
    try {
      await this.randomDelay(300, 800);
      await page.getByRole(role, options).first().click();
      logger.debug(`Clicked element with role: ${role}`);
      return true;
    } catch (error) {
      logger.error(`Failed to click element with role: ${role}`, { error: error.message });
      return false;
    }
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle(page, timeout = 30000) {
    try {
      await page.waitForLoadState('networkidle', { timeout });
      return true;
    } catch (error) {
      logger.error('Network idle timeout', { error: error.message });
      return false;
    }
  }

  /**
   * Fill input field (Playwright's optimized method)
   */
  async fillInput(page, selector, value) {
    try {
      await page.locator(selector).first().fill(value);
      logger.debug(`Filled ${selector} with value`);
      return true;
    } catch (error) {
      logger.error(`Failed to fill ${selector}`, { error: error.message });
      return false;
    }
  }
}

module.exports = new PlaywrightService();
