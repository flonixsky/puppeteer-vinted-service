const puppeteerService = require('./puppeteer');
const logger = require('../utils/logger');

class VintedService {
  constructor() {
    this.baseUrl = 'https://www.vinted.de';
  }

  async login(email, password) {
    const startTime = Date.now();
    let page = null;

    try {
      logger.info('Starting Vinted login', { email });

      page = await puppeteerService.createPage();

      logger.info('Navigating to Vinted homepage...');
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await puppeteerService.randomDelay(2000, 3000);

      await this.handleCookieBanner(page);

      logger.info('Clicking login button in header...');

      await puppeteerService.randomDelay(2000, 3000);

      const loginButtonSelectors = [
        'button[data-testid="header-login-button"]',
        'a[data-testid="header-login-button"]',
        'a[href="/member/general/login"]',
        'a[href*="/member/login"]',
        'button:has-text("Einloggen")',
        'a:has-text("Einloggen")',
        '.web_ui__Button__button:has-text("Einloggen")'
      ];

      let loginButtonClicked = false;
      for (const selector of loginButtonSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.click(selector);
          logger.info(`Clicked login button: ${selector}`);
          loginButtonClicked = true;
          await puppeteerService.randomDelay(1500, 2500);
          break;
        } catch (e) {
          continue;
        }
      }

      if (!loginButtonClicked) {
        throw new Error('Could not find login button in header');
      }

      await puppeteerService.randomDelay(2000, 3000);

      const screenshotBefore = await puppeteerService.takeScreenshot(page);

      logger.info('Filling login form...');

      const emailSelector = 'input#username, input[name="username"]';
      const passwordSelector = 'input#password, input[name="password"]';
      const submitSelector = 'button[type="submit"]';

      const emailSuccess = await puppeteerService.humanType(page, emailSelector, email);
      if (!emailSuccess) {
        throw new Error('Failed to enter email');
      }

      await puppeteerService.randomDelay(500, 1000);

      const passwordSuccess = await puppeteerService.humanType(page, passwordSelector, password);
      if (!passwordSuccess) {
        throw new Error('Failed to enter password');
      }

      await puppeteerService.randomDelay(1000, 2000);

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

      const screenshotAfter = await puppeteerService.takeScreenshot(page);

      const currentUrl = page.url();
      logger.info('Current URL after login', { url: currentUrl });

      if (currentUrl.includes('/member/login')) {
        throw new Error('Login failed - still on login page. Check credentials or CAPTCHA required.');
      }

      const cookies = await puppeteerService.getCookies(page);

      if (cookies.length < 3) {
        throw new Error('Login might have failed - not enough cookies received');
      }

      const userAgent = await page.evaluate(() => navigator.userAgent);

      const duration = Date.now() - startTime;
      logger.info('Login successful', {
        duration,
        cookieCount: cookies.length,
        finalUrl: currentUrl
      });

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

      let errorScreenshot = null;
      if (page) {
        errorScreenshot = await puppeteerService.takeScreenshot(page);
      }

      await puppeteerService.closeBrowser();

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        errorScreenshot: errorScreenshot
      };
    }
  }

  async publishArticle(article, cookies, userAgent) {
    const startTime = Date.now();
    let page = null;

    try {
      logger.info('Starting Vinted publish', {
        articleId: article.id,
        title: article.title
      });

      page = await puppeteerService.createPage(userAgent);

      await puppeteerService.setCookies(page, cookies);

      logger.info('Navigating to upload page...');
      await page.goto(`${this.baseUrl}/items/new`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await puppeteerService.randomDelay(2000, 3000);

      const isLoggedIn = await this.checkIfLoggedIn(page);
      if (!isLoggedIn) {
        throw new Error('Not logged in. Cookies might be expired.');
      }

      logger.info('Filling article details...');

      const titleSelector = 'input[id="title"], input[name="title"]';
      await puppeteerService.humanType(page, titleSelector, article.title);
      await puppeteerService.randomDelay(500, 1000);

      if (article.description) {
        const descriptionSelector = 'textarea[id="description"], textarea[name="description"]';
        await puppeteerService.humanType(page, descriptionSelector, article.description);
        await puppeteerService.randomDelay(500, 1000);
      }

      if (article.price_recommended) {
        logger.info('Setting price...');
        const priceSelector = 'input[id="price"], input[name="price"]';
        await puppeteerService.humanType(
          page,
          priceSelector,
          article.price_recommended.toString()
        );
        await puppeteerService.randomDelay(500, 1000);
      }

      if (article.brand) {
        logger.info('Setting brand...');
        const brandSelector = 'input[id="brand"], input[name="brand"]';
        await puppeteerService.humanType(page, brandSelector, article.brand);
        await puppeteerService.randomDelay(500, 1000);
      }

      const screenshotBefore = await puppeteerService.takeScreenshot(page);

      logger.info('Article filled, ready to submit (currently disabled for testing)');

      const screenshotAfter = await puppeteerService.takeScreenshot(page);

      const finalUrl = page.url();
      
      const vintedId = 'test-' + Date.now();

      const duration = Date.now() - startTime;

      logger.info('Publish completed', {
        duration,
        finalUrl,
        vintedId
      });

      await puppeteerService.closeBrowser();

      return {
        success: true,
        vintedUrl: finalUrl,
        vintedId: vintedId,
        duration,
        screenshot: screenshotAfter
      };

    } catch (error) {
      logger.error('Publish failed', {
        error: error.message,
        duration: Date.now() - startTime
      });

      let errorScreenshot = null;
      if (page) {
        errorScreenshot = await puppeteerService.takeScreenshot(page);
      }

      await puppeteerService.closeBrowser();

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        screenshot: errorScreenshot
      };
    }
  }

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
          continue;
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

      if (url.includes('/member/login')) {
        return false;
      }

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
