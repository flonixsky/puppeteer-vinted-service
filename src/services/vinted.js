const playwrightService = require('./playwright');
const categorySelector = require('./categorySelector');
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

      page = await playwrightService.createPage();

      logger.info('Navigating to Vinted homepage...');
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await playwrightService.randomDelay(2000, 3000);

      await this.handleCookieBanner(page);

      logger.info('Clicking login button in header...');

      await playwrightService.randomDelay(2000, 3000);

      // Try to find and click login button using multiple strategies
      const loginButtonSelectors = [
        'button[data-testid="header-login-button"]',
        'a[data-testid="header-login-button"]',
        'a[href="/member/general/login"]',
        'a[href*="/member/login"]'
      ];

      let loginButtonClicked = false;
      
      // Try with selectors first
      for (const selector of loginButtonSelectors) {
        try {
          const element = page.locator(selector).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          logger.info(`Clicked login button: ${selector}`);
          loginButtonClicked = true;
          await playwrightService.randomDelay(1500, 2500);
          break;
        } catch (e) {
          continue;
        }
      }

      // Try with text if selectors didn't work
      if (!loginButtonClicked) {
        try {
          await page.getByText('Einloggen', { exact: false }).first().click();
          logger.info('Clicked login button by text');
          loginButtonClicked = true;
          await playwrightService.randomDelay(1500, 2500);
        } catch (e) {
          // Continue
        }
      }

      if (!loginButtonClicked) {
        throw new Error('Could not find login button in header');
      }

      await playwrightService.randomDelay(2000, 3000);

      const screenshotBefore = await playwrightService.takeScreenshot(page);

      logger.info('Filling login form...');

      const emailSelector = 'input#username, input[name="username"]';
      const passwordSelector = 'input#password, input[name="password"]';
      const submitSelector = 'button[type="submit"]';

      const emailSuccess = await playwrightService.humanType(page, emailSelector, email);
      if (!emailSuccess) {
        throw new Error('Failed to enter email');
      }

      await playwrightService.randomDelay(500, 1000);

      const passwordSuccess = await playwrightService.humanType(page, passwordSelector, password);
      if (!passwordSuccess) {
        throw new Error('Failed to enter password');
      }

      await playwrightService.randomDelay(1000, 2000);

      logger.info('Submitting login form...');
      
      // Click submit and wait for navigation
      await page.locator(submitSelector).click();
      
      // Wait for navigation with timeout
      try {
        await page.waitForLoadState('networkidle', { timeout: 15000 });
      } catch (e) {
        logger.warn('Navigation timeout after login submit - might be OK');
      }

      await playwrightService.randomDelay(3000, 5000);

      const screenshotAfter = await playwrightService.takeScreenshot(page);

      const currentUrl = page.url();
      logger.info('Current URL after login', { url: currentUrl });

      if (currentUrl.includes('/member/login')) {
        throw new Error('Login failed - still on login page. Check credentials or CAPTCHA required.');
      }

      const cookies = await playwrightService.getCookies(page);

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

      await playwrightService.closeBrowser();

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
        errorScreenshot = await playwrightService.takeScreenshot(page);
      }

      await playwrightService.closeBrowser();

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

      page = await playwrightService.createPage(userAgent);

      // WICHTIG: Erst zur Homepage, DANN Cookies setzen!
      logger.info('Navigating to homepage first...');
      await page.goto(this.baseUrl, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await playwrightService.randomDelay(1000, 2000);

      // Jetzt Cookies setzen
      logger.info('Setting cookies...');
      await playwrightService.setCookies(page, cookies);

      await playwrightService.randomDelay(1000, 2000);

      // Seite neu laden um Cookies zu aktivieren
      logger.info('Reloading page with cookies...');
      await page.reload({ waitUntil: 'networkidle' });

      await playwrightService.randomDelay(2000, 3000);

      // Screenshot von Homepage mit Cookies
      const screenshotHome = await playwrightService.takeScreenshot(page);
      logger.info('Screenshot taken from homepage');

      // Check ob eingeloggt
      const isLoggedIn = await this.checkIfLoggedIn(page);
      logger.info('Login status check', { isLoggedIn });

      if (!isLoggedIn) {
        throw new Error('Not logged in after setting cookies. Please check cookie validity.');
      }

      // Jetzt zur Upload-Seite
      logger.info('Navigating to upload page...');
      await page.goto(`${this.baseUrl}/items/new`, {
        waitUntil: 'networkidle',
        timeout: 30000
      });

      await playwrightService.randomDelay(2000, 3000);

      // Screenshot von Upload-Seite
      const screenshotUpload = await playwrightService.takeScreenshot(page);
      logger.info('Screenshot taken from upload page');

      logger.info('Filling article details...');

      // Title field - use Playwright's more robust methods
      const titleSelector = 'input[id="title"], input[name="title"]';
      await playwrightService.humanType(page, titleSelector, article.title);
      await playwrightService.randomDelay(500, 1000);

      if (article.description) {
        const descriptionSelector = 'textarea[id="description"], textarea[name="description"]';
        await playwrightService.humanType(page, descriptionSelector, article.description);
        await playwrightService.randomDelay(500, 1000);
      }

      if (article.price_recommended) {
        logger.info('Setting price...');
        const priceSelector = 'input[id="price"], input[name="price"]';
        await playwrightService.humanType(
          page,
          priceSelector,
          article.price_recommended.toString()
        );
        await playwrightService.randomDelay(500, 1000);
      }

      // Kategorie-Auswahl - using improved Playwright locators
      if (article.category || article.ai_analysis?.category) {
        logger.info('Selecting category...');
        const { findBestCategory } = require('../utils/categoryMapping');
        
        const categoryName = article.category || article.ai_analysis?.category;
        const gender = article.ai_analysis?.gender;
        
        const vintedCategory = findBestCategory(categoryName, gender);
        logger.info('Selected category', { 
          vintedCategory: vintedCategory.full_path,
          depth: vintedCategory.depth 
        });
        
        // NEW: Use dedicated CategorySelector service with multiple fallback strategies
        const categoryResult = await categorySelector.selectCategory(page, vintedCategory);
        
        if (!categoryResult.success) {
          throw new Error(`Failed to navigate to category: ${categoryResult.error}`);
        }
        
        logger.info('Category selected successfully');
        
        await playwrightService.randomDelay(1000, 2000);
      }

      if (article.brand) {
        logger.info('Setting brand...');
        const brandSelector = 'input[id="brand"], input[name="brand"]';
        await playwrightService.humanType(page, brandSelector, article.brand);
        await playwrightService.randomDelay(500, 1000);
      }

      const screenshotFilled = await playwrightService.takeScreenshot(page);

      logger.info('Article filled, ready to submit (currently disabled for testing)');

      const finalUrl = page.url();
      
      const vintedId = 'test-' + Date.now();

      const duration = Date.now() - startTime;

      logger.info('Publish completed', {
        duration,
        finalUrl,
        vintedId
      });

      await playwrightService.closeBrowser();

      return {
        success: true,
        vintedUrl: finalUrl,
        vintedId: vintedId,
        duration,
        screenshot: screenshotFilled
      };

    } catch (error) {
      logger.error('Publish failed', {
        error: error.message,
        duration: Date.now() - startTime
      });

      let errorScreenshot = null;
      if (page) {
        errorScreenshot = await playwrightService.takeScreenshot(page);
      }

      await playwrightService.closeBrowser();

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

      // Try Playwright's getByRole first (more reliable)
      try {
        await page.getByRole('button', { name: /akzeptieren|accept/i }).first().click();
        logger.info('Cookie banner accepted via role');
        await playwrightService.randomDelay(1000, 2000);
        return true;
      } catch (e) {
        // Continue with other methods
      }

      // Try by text
      try {
        await page.getByText('Akzeptieren', { exact: false }).first().click();
        logger.info('Cookie banner accepted via text');
        await playwrightService.randomDelay(1000, 2000);
        return true;
      } catch (e) {
        // Continue with other methods
      }

      // Try with selectors
      const cookieSelectors = [
        'button[id*="onetrust-accept"]',
        'button[id*="accept-cookies"]'
      ];

      for (const selector of cookieSelectors) {
        try {
          const button = page.locator(selector).first();
          await button.waitFor({ state: 'visible', timeout: 2000 });
          await button.click();
          logger.info('Cookie banner accepted via selector');
          await playwrightService.randomDelay(1000, 2000);
          return true;
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

      // Prüfe URL
      if (url.includes('/member/login')) {
        logger.info('On login page - not logged in');
        return false;
      }

      // Warte kurz auf User-Menu
      await playwrightService.randomDelay(1000, 2000);

      // Try with Playwright's getByRole first
      try {
        const userMenu = page.getByRole('button', { name: /profil|account|user/i }).first();
        await userMenu.waitFor({ state: 'visible', timeout: 3000 });
        logger.info('User menu found via role');
        return true;
      } catch (e) {
        // Continue with other methods
      }

      // Prüfe mehrere Selektoren
      const userMenuSelectors = [
        '[data-testid="user-menu"]',
        '[data-testid="header-user-menu"]',
        'button[data-testid="user-menu-button"]',
        'a[href*="/member/settings"]',
        '[class*="UserMenu"]'
      ];

      for (const selector of userMenuSelectors) {
        try {
          const element = page.locator(selector).first();
          await element.waitFor({ state: 'visible', timeout: 2000 });
          logger.info(`User menu found with selector: ${selector}`);
          return true;
        } catch (e) {
          continue;
        }
      }

      logger.warn('No user menu elements found');
      return false;
    } catch (error) {
      logger.error('Error checking login status', { error: error.message });
      return false;
    }
  }
}

module.exports = new VintedService();
