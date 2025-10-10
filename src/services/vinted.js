const puppeteerService = require('./puppeteer');
const logger = require('../utils/logger');

class VintedService {
  constructor() {
    this.baseUrl = 'https://www.vinted.de';
  }

  // ========================================
  // LOGIN
  // ========================================

  async login(email, password) {
    const startTime = Date.now();
    let page = null;

    try {
      logger.info('Starting Vinted login', { email });

      // Create new page
      page = await puppeteerService.createPage();

      // Navigate to login page
      logger.info('Navigating to Vinted login page...');
      await page.goto(`${this.baseUrl}/member/login`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await puppeteerService.randomDelay(2000, 3000);

      // Take screenshot before login
      const screenshotBefore = await puppeteerService.takeScreenshot(page);

      // Handle cookie banner (if present)
      await this.handleCookieBanner(page);

      // Fill login form
      logger.info('Filling login form...');
      
      const emailSelector = 'input[name="login"], input[type="email"]';
      const passwordSelector = 'input[name="password"], input[type="password"]';
      const submitSelector = 'button[type="submit"]';

      // Email
      const emailSuccess = await puppeteerService.humanType(page, emailSelector, email);
      if (!emailSuccess) {
        throw new Error('Failed to enter email');
      }

      await puppeteerService.randomDelay(500, 1000);

      // Password
      const passwordSuccess = await puppeteerService.humanType(page, passwordSelector, password);
      if (!passwordSuccess) {
        throw new Error('Failed to enter password');
      }

      await puppeteerService.randomDelay(1000, 2000);

      // Submit
      logger.info('Submitting login form...');
      await Promise.all([
        page.click(submitSelector),
        page.waitForNavigation({ 
          waitUntil: 'networkidle2', 
          timeout: 15000 
        }).catch(() => {
          logger.warn('Navigation timeout after login submit - might be OK');
        })
      ]);

      await puppeteerService.randomDelay(3000, 5000);

      // Take screenshot after login
      const screenshotAfter = await puppeteerService.takeScreenshot(page);

      // Check if login was successful
      const currentUrl = page.url();
      logger.info('Current URL after login', { url: currentUrl });

      // If still on login page, login failed
      if (currentUrl.includes('/member/login')) {
        throw new Error('Login failed - still on login page. Check credentials or CAPTCHA required.');
      }

      // Get cookies
      const cookies = await puppeteerService.getCookies(page);

      if (cookies.length < 3) {
        throw new Error('Login might have failed - not enough cookies received');
      }

      // Get user agent
      const userAgent = await page.evaluate(() => navigator.userAgent);

      const duration = Date.now() - startTime;
      logger.info('Login successful', { 
        duration,
        cookieCount: cookies.length,
        finalUrl: currentUrl
      });

      // Close browser
      await puppeteerService.closeBrowser();

      return {
        success: true,
        cookies: cookies,
        userAgent: userAgent,
        duration: duration,
        screenshots: {
          before: screenshotBefore,
          after: screenshotAfter
        },
        finalUrl: currentUrl
      };

    } catch (error) {
      logger.error('Login failed', { 
        error: error.message,
        duration: Date.now() - startTime
      });

      // Take error screenshot
      let errorScreenshot = null;
      if (page) {
        errorScreenshot = await puppeteerService.takeScreenshot(page);
      }

      // Close browser
      await puppeteerService.closeBrowser();

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        errorScreenshot: errorScreenshot
      };
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  async handleCookieBanner(page) {
    try {
      logger.info('Checking for cookie banner...');
      
      const cookieSelectors = [
        'button[id*="onetrust-accept"]',
        'button[id*="accept-cookies"]',
        'button:has-text("Akzeptieren")',
        'button:has-text("Accept")'
      ];

      for (const selector of cookieSelectors) {
        try {
          const button = await page.$(selector);
          if (button) {
            await button.click();
            logger.info('Cookie banner accepted');
            await puppeteerService.randomDelay(1000, 2000);
            return true;
          }
        } catch (e) {
          // Continue trying other selectors
        }
      }

      logger.info('No cookie banner found');
      return false;
    } catch (error) {
      logger.warn('Error handling cookie banner', { error: error.message });
      return false;
    }
  }

  async checkIfLoggedIn(page) {
    try {
      const url = page.url();
      
      // If on login page, not logged in
      if (url.includes('/member/login')) {
        return false;
      }

      // Check for user menu or profile elements
      const userMenuSelectors = [
        '[data-testid="user-menu"]',
        '.user-menu',
        'a[href*="/member/settings"]'
      ];

      for (const selector of userMenuSelectors) {
        const element = await page.$(selector);
        if (element) {
          logger.info('User is logged in');
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error('Error checking login status', { error: error.message });
      return false;
    }
  }
}

module.exports = new VintedService();
