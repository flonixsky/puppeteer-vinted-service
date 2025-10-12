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

      // Navigate to homepage first
      logger.info('Navigating to Vinted homepage...');
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await puppeteerService.randomDelay(2000, 3000);

      // Handle cookie banner
      await this.handleCookieBanner(page);

      // Click "Einloggen" button in header
logger.info('Clicking login button in header...');

// Wait a bit more for page to fully load
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

      // Wait for modal to appear
      await puppeteerService.randomDelay(2000, 3000);

      // Take screenshot before login
      const screenshotBefore = await puppeteerService.takeScreenshot(page);

      // Fill login form
      logger.info('Filling login form...');
      
      const emailSelector = 'input#username, input[name="username"]';
      const passwordSelector = 'input#password, input[name="password"]';
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

  // ========================================
  // PUBLISH ARTICLE
  // ========================================

  async publishArticle(article, cookies, userAgent) {
    const startTime = Date.now();
    let page = null;

    try {
      logger.info('Starting Vinted publish', {
        articleId: article.id,
        title: article.title
      });

      page = await puppeteerService.createPage(userAgent);

      // Set cookies
      await puppeteerService.setCookies(page, cookies);

      // Navigate to upload page
      logger.info('Navigating to upload page...');
      await page.goto(`${this.baseUrl}/items/new`, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      await puppeteerService.randomDelay(2000, 3000);

      // Check if logged in
      const isLoggedIn = await this.checkIfLoggedIn(page);
      if (!isLoggedIn) {
        throw new Error('Not logged in. Cookies might be expired.');
      }

      // Upload photos
      logger.info('Uploading photos...');
      const photoUrl = article.processed_image_url || article.original_image_url;
      
      if (!photoUrl) {
        throw new Error('No image URL found for article');
      }

      // Download image and upload
      const imageSelector = 'input[type="file"][accept*="image"]';
      await page.waitForSelector(imageSelector, { timeout: 10000 });
      
      // TODO: Download image from URL and upload as file
      // For now, we'll skip this and fill other fields
      
      logger.info('Filling article details...');

      // Title
      const titleSelector = 'input[id="title"], input[name="title"]';
      await puppeteerService.humanType(page, titleSelector, article.title);
      await puppeteerService.randomDelay(500, 1000);

      // Description
      const descriptionSelector = 'textarea[id="description"], textarea[name="description"]';
      if (article.description) {
        await puppeteerService.humanType(page, descriptionSelector, article.description);
        await puppeteerService.randomDelay(500, 1000);
      }

      // Category - click dropdown and select
      if (article.category) {
        logger.info('Selecting category...');
        // Category logic will depend on Vinted's current DOM structure
        // This is a placeholder
      }

      // Price
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

      // Brand
      if (article.brand) {
        logger.info('Setting brand...');
        const brandSelector = 'input[id="brand"], input[name="brand"]';
        await puppeteerService.humanType(page, brandSelector, article.brand);
        await puppeteerService.randomDelay(500, 1000);
      }

      // Size
      if (article.size) {
        logger.info('Setting size...');
        // Size selection logic
      }

      // Condition
      if (article.condition) {
        logger.info('Setting condition...');
        // Condition selection logic
      }

      // Color
      if (article.color) {
        logger.info('Setting color...');
        // Color selection logic
      }

      // Take screenshot before submit
      const screenshotBefore = await puppeteerService.takeScreenshot(page);

      // Submit (disabled for safety - enable when ready)
      logger.info('Article filled, ready to submit (currently disabled for testing)');
      
      // Uncomment when ready:
      // const submitSelector = 'button[type="submit"]';
      // await page.click(submitSelector);
      // await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });

      // Take screenshot after
      const screenshotAfter = await puppeteerService.takeScreenshot(page);

      // Get final URL
      const finalUrl = page.url();
      
      // Extract Vinted ID from URL (placeholder)
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
}

module.exports = new VintedService();
