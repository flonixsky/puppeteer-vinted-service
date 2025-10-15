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

      // const screenshotBefore = await playwrightService.takeScreenshot(page);

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

      // const screenshotAfter = await playwrightService.takeScreenshot(page);

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
      // Screenshot disabled to save tokens
      // if (page) {
      //   errorScreenshot = await playwrightService.takeScreenshot(page);
      // }

      await playwrightService.closeBrowser();

      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        errorScreenshot: null
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

      // Screenshot von Homepage mit Cookies - DISABLED to save tokens
      // const screenshotHome = await playwrightService.takeScreenshot(page);
      logger.info('Screenshot disabled - skipping homepage screenshot');

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

      // Screenshot von Upload-Seite - DISABLED to save tokens
      // const screenshotUpload = await playwrightService.takeScreenshot(page);
      logger.info('Screenshot disabled - skipping upload page screenshot');

      logger.info('Starting article upload...');

      // Prepare image URLs (will upload AFTER filling all other fields)
      let imageUrls = [];
      
      if (article.image_urls && Array.isArray(article.image_urls) && article.image_urls.length > 0) {
        imageUrls = article.image_urls;
      } else if (article.original_image_url) {
        imageUrls = [article.original_image_url];
      } else if (article.processed_image_url) {
        imageUrls = [article.processed_image_url];
      }
      
      if (imageUrls.length === 0) {
        logger.warn('No image URLs found - article will be published without photos');
      } else {
        logger.info('Image URLs prepared, will try to upload AFTER filling all fields', { count: imageUrls.length });
      }

      // VALIDATION: Ensure minimum 5 characters for title and description
      const title = article.title || '';
      const description = article.description || '';
      
      if (title.length < 5) {
        throw new Error(`Title must be at least 5 characters long (current: ${title.length})`);
      }
      
      if (description.length < 5) {
        throw new Error(`Description must be at least 5 characters long (current: ${description.length})`);
      }

      // Title field - use Playwright's more robust methods
      logger.info('Setting title...', { length: title.length });
      const titleSelector = 'input[id="title"], input[name="title"]';
      await playwrightService.humanType(page, titleSelector, title);
      await playwrightService.randomDelay(500, 1000);

      // Description field
      logger.info('Setting description...', { length: description.length });
      const descriptionSelector = 'textarea[id="description"], textarea[name="description"]';
      await playwrightService.humanType(page, descriptionSelector, description);
      await playwrightService.randomDelay(500, 1000);

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

      // SIZE field (required)
      if (article.size || article.ai_analysis?.size) {
        const size = article.size || article.ai_analysis?.size;
        logger.info('Setting size...', { size });
        
        // Try multiple selectors for size field
        const sizeSelectors = [
          'select[id="size"], select[name="size"]',
          'input[id="size"], input[name="size"]',
          '[data-testid="size-select"]'
        ];
        
        let sizeSet = false;
        for (const selector of sizeSelectors) {
          try {
            const element = page.locator(selector).first();
            await element.waitFor({ state: 'visible', timeout: 3000 });
            
            // Check if it's a select or input
            const tagName = await element.evaluate(el => el.tagName.toLowerCase());
            if (tagName === 'select') {
              await element.selectOption({ label: size });
            } else {
              await playwrightService.humanType(page, selector, size);
            }
            sizeSet = true;
            logger.info('Size set successfully');
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!sizeSet) {
          logger.warn('Could not set size field - may be optional or category-specific');
        }
        
        await playwrightService.randomDelay(500, 1000);
      }

      // CONDITION field (required)
      if (article.condition || article.ai_analysis?.condition) {
        const condition = article.condition || article.ai_analysis?.condition;
        logger.info('Setting condition...', { condition });
        
        const conditionSelectors = [
          'select[id="status"], select[name="status"]',
          'select[id="condition"], select[name="condition"]',
          '[data-testid="condition-select"]'
        ];
        
        let conditionSet = false;
        for (const selector of conditionSelectors) {
          try {
            const element = page.locator(selector).first();
            await element.waitFor({ state: 'visible', timeout: 3000 });
            
            // Map condition to Vinted values
            const conditionMap = {
              'neu': 'Neu mit Etikett',
              'sehr gut': 'Sehr gut',
              'gut': 'Gut',
              'zufriedenstellend': 'Zufriedenstellend',
              'new': 'Neu mit Etikett',
              'very good': 'Sehr gut',
              'good': 'Gut',
              'satisfactory': 'Zufriedenstellend'
            };
            
            const vintedCondition = conditionMap[condition.toLowerCase()] || condition;
            await element.selectOption({ label: vintedCondition });
            conditionSet = true;
            logger.info('Condition set successfully', { vintedCondition });
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!conditionSet) {
          logger.warn('Could not set condition field');
        }
        
        await playwrightService.randomDelay(500, 1000);
      }

      // COLOR field (required)
      if (article.color || article.ai_analysis?.color) {
        const color = article.color || article.ai_analysis?.color;
        logger.info('Setting color...', { color });
        
        const colorSelectors = [
          'select[id="color"], select[name="color"]',
          'input[id="color"], input[name="color"]',
          '[data-testid="color-select"]'
        ];
        
        let colorSet = false;
        for (const selector of colorSelectors) {
          try {
            const element = page.locator(selector).first();
            await element.waitFor({ state: 'visible', timeout: 3000 });
            
            const tagName = await element.evaluate(el => el.tagName.toLowerCase());
            if (tagName === 'select') {
              // Try to find matching color option
              await element.selectOption({ label: color });
            } else {
              await playwrightService.humanType(page, selector, color);
            }
            colorSet = true;
            logger.info('Color set successfully');
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!colorSet) {
          logger.warn('Could not set color field');
        }
        
        await playwrightService.randomDelay(500, 1000);
      }

      // PHOTO UPLOAD - Try at the END after all fields are filled
      if (imageUrls.length > 0) {
        logger.info('Now attempting photo upload after filling all fields...', { count: imageUrls.length });
        
        try {
          const uploadResult = await this.uploadPhotos(page, imageUrls);
          
          if (uploadResult.success) {
            logger.info('Photos uploaded successfully', { count: uploadResult.uploadedCount });
          } else {
            logger.warn('Photo upload failed but continuing', { error: uploadResult.error });
          }
        } catch (error) {
          logger.warn('Photo upload threw error but continuing', { error: error.message });
        }
        
        await playwrightService.randomDelay(2000, 3000);
      }

      // const screenshotFilled = await playwrightService.takeScreenshot(page);

      logger.info('Article filled including photos, submitting now...');

      // Find and click submit button
      const submitButtonSelectors = [
        'button[type="submit"]',
        'button[data-testid="item-upload-form-button"]',
        'button[data-testid="submit-button"]',
        'button.Button--primary',
        'button:has-text("Hochladen")',
        'button:has-text("Veröffentlichen")'
      ];

      let submitSuccess = false;
      let foundButDisabled = [];
      
      // Try different selectors
      for (const selector of submitButtonSelectors) {
        try {
          const submitButtons = await page.locator(selector).all();
          logger.info(`Checking selector "${selector}" - found ${submitButtons.length} button(s)`);
          
          if (submitButtons.length === 0) {
            continue;
          }
          
          const submitButton = page.locator(selector).first();
          await submitButton.waitFor({ state: 'visible', timeout: 3000 });
          
          // Check if button is enabled
          const isDisabled = await submitButton.getAttribute('disabled');
          const buttonText = await submitButton.textContent();
          
          logger.info(`Button found: "${buttonText}" - Disabled: ${isDisabled !== null}`);
          
          if (isDisabled !== null) {
            foundButDisabled.push({ selector, text: buttonText });
            logger.warn(`Submit button found but disabled: ${selector}`);
            continue;
          }
          
          logger.info(`Clicking submit button: ${selector}`);
          await submitButton.click();
          submitSuccess = true;
          break;
        } catch (e) {
          logger.debug(`Submit button not found or error with selector "${selector}": ${e.message}`);
          continue;
        }
      }

      if (!submitSuccess) {
        if (foundButDisabled.length > 0) {
          logger.error('Submit button(s) found but all disabled', { foundButDisabled });
          throw new Error('Submit button is disabled - likely missing required fields (photos?)');
        }
        throw new Error('Could not find submit button on page');
      }

      await playwrightService.randomDelay(2000, 3000);

      // Wait for navigation or success indication
      logger.info('Waiting for publish to complete...');
      
      try {
        // Wait for URL change (article published)
        await page.waitForURL(/catalog|items\/\d+/, { timeout: 20000 });
        logger.info('Navigation detected after submit');
      } catch (e) {
        logger.warn('No URL change detected, checking for success indicators...');
      }

      await playwrightService.randomDelay(2000, 3000);

      const finalUrl = page.url();
      // const screenshotAfterSubmit = await playwrightService.takeScreenshot(page);
      const screenshotAfterSubmit = null; // Disabled to save tokens
      
      // Try to extract Vinted article ID from URL
      let vintedId = null;
      const urlMatch = finalUrl.match(/items\/(\d+)/);
      if (urlMatch) {
        vintedId = urlMatch[1];
        logger.info('Extracted Vinted ID from URL', { vintedId });
      } else {
        // Fallback: check for catalog URL (successful listing)
        if (finalUrl.includes('/catalog')) {
          vintedId = 'catalog-' + Date.now();
          logger.info('Article listed in catalog (no specific ID extracted)');
        } else {
          throw new Error('Could not verify article was published successfully');
        }
      }

      const duration = Date.now() - startTime;

      logger.info('Publish completed successfully', {
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
        screenshot: screenshotAfterSubmit
      };

    } catch (error) {
      logger.error('Publish failed', {
        error: error.message,
        duration: Date.now() - startTime
      });

      let errorScreenshot = null;
      // Screenshot disabled to save tokens
      // if (page) {
      //   errorScreenshot = await playwrightService.takeScreenshot(page);
      // }

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

  async uploadPhotos(page, imageUrls) {
    const fs = require('fs').promises;
    const fsSync = require('fs');
    const path = require('path');
    const https = require('https');
    const http = require('http');
    
    try {
      logger.info('Starting photo upload process...', { urlCount: imageUrls.length });
      
      // STEP 1: Click "+ Fotos hinzufügen" button to trigger file input
      // According to user: clicking this button opens Windows Explorer
      logger.info('Looking for "+ Fotos hinzufügen" button...');
      
      const photoButtonSelectors = [
        'button:has-text("Fotos hinzufügen")',
        'button:has-text("+ Fotos")',
        '[data-testid*="photo"]',
        '[data-testid*="upload"]',
        'label[for*="photo"]',  // Sometimes it's a label acting as button
        'button:has-text("Foto")'
      ];
      
      let buttonClicked = false;
      for (const selector of photoButtonSelectors) {
        try {
          const button = page.locator(selector).first();
          await button.waitFor({ state: 'visible', timeout: 3000 });
          logger.info(`Found photo button with selector: ${selector}`);
          // ACTUALLY CLICK THE BUTTON!
          await button.click();
          logger.info(`✓ Clicked photo button with selector: ${selector}`);
          buttonClicked = true;
          // Wait for file input to appear after click
          await playwrightService.randomDelay(500, 1000);
          break;
        } catch (e) {
          logger.debug(`Button not found or not clickable with selector: ${selector}`);
          continue;
        }
      }
      
      if (!buttonClicked) {
        logger.warn('Could not find/click "+ Fotos hinzufügen" button - trying to find file input directly');
      }
      
      // STEP 2: Find file input element
      // After clicking button OR if it's already on the page
      logger.info('Looking for file input element...');
      
      const fileInputSelectors = [
        'input[type="file"][accept*="image"]',  // Most specific
        'input[type="file"]',                    // Generic file input
        '#photos input[type="file"]',            // Inside photos container
        '[id*="photo"] input[type="file"]',      // Any photo-related container
        '[class*="photo" i] input[type="file"]', // Class-based
        'input[accept*="image"]'                 // By accept attribute only
      ];
      
      let fileInput = null;
      let foundSelector = null;
      
      for (const selector of fileInputSelectors) {
        try {
          const inputs = await page.locator(selector).all();
          logger.info(`Checking selector: ${selector} - found ${inputs.length} inputs`);
          
          if (inputs.length > 0) {
            fileInput = page.locator(selector).first();
            foundSelector = selector;
            
            // Check if it's the right input
            try {
              const acceptAttr = await fileInput.getAttribute('accept');
              logger.info(`Found file input with accept: ${acceptAttr}`);
              
              if (acceptAttr && acceptAttr.includes('image')) {
                logger.info(`✓ Using file input with selector: ${selector}`);
                break;
              }
            } catch (e) {
              // If we can't get accept attribute, still try to use it
              logger.info(`✓ Using file input with selector: ${selector} (accept attr check failed)`);
              break;
            }
          }
        } catch (e) {
          logger.debug(`Selector ${selector} failed: ${e.message}`);
          continue;
        }
      }
      
      if (!fileInput) {
        logger.error('Could not find file input element');
        
        // Screenshot disabled to save tokens
        // const debugScreenshot = await playwrightService.takeScreenshot(page);
        logger.error('Screenshot disabled - file input not found');
        
        return { success: false, error: 'Could not find file input element' };
      }
      
      const uploadedFiles = [];
      const tempDir = '/tmp/vinted-uploads';
      
      // Create temp directory if it doesn't exist
      if (!fsSync.existsSync(tempDir)) {
        await fs.mkdir(tempDir, { recursive: true });
        logger.info(`Created temp directory: ${tempDir}`);
      }
      
      // Download and upload each image
      for (let i = 0; i < Math.min(imageUrls.length, 20); i++) { // Max 20 photos per Vinted limits
        const imageUrl = imageUrls[i];
        logger.info(`Processing image ${i + 1}/${imageUrls.length}`, { url: imageUrl });
        
        try {
          // Determine file extension from URL
          const urlExt = imageUrl.split('.').pop().split('?')[0].toLowerCase();
          const ext = ['jpg', 'jpeg', 'png', 'webp'].includes(urlExt) ? urlExt : 'jpg';
          const filename = `vinted_image_${Date.now()}_${i}.${ext}`;
          const filepath = path.join(tempDir, filename);
          
          // Download image to temp file
          logger.info(`Downloading image from ${imageUrl}...`);
          await new Promise((resolve, reject) => {
            const protocol = imageUrl.startsWith('https') ? https : http;
            const file = fsSync.createWriteStream(filepath);
            
            protocol.get(imageUrl, (response) => {
              if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
              }
              
              response.pipe(file);
              
              file.on('finish', () => {
                file.close();
                logger.info(`✓ Downloaded to ${filepath}`);
                resolve();
              });
              
              file.on('error', (err) => {
                fsSync.unlink(filepath, () => {});
                reject(err);
              });
            }).on('error', (err) => {
              fsSync.unlink(filepath, () => {});
              reject(err);
            });
          });
          
          // Verify file exists and has size
          const stats = await fs.stat(filepath);
          logger.info(`File size: ${stats.size} bytes`);
          
          if (stats.size === 0) {
            throw new Error('Downloaded file is empty');
          }
          
          // Upload to Vinted using Playwright's setInputFiles
          // This works even for hidden inputs - Playwright handles it internally
          logger.info(`Uploading to Vinted via file input...`);
          await fileInput.setInputFiles(filepath);
          logger.info(`✓ Image ${i + 1} uploaded successfully`);
          
          uploadedFiles.push(filepath);
          
          // Wait for Vinted to process the upload
          // Check for upload progress indicators
          await playwrightService.randomDelay(1500, 2500);
          
        } catch (error) {
          logger.error(`Failed to process image ${i + 1}`, { 
            error: error.message,
            url: imageUrl
          });
          // Continue with next image instead of failing completely
        }
      }
      
      // Wait a bit more for all uploads to finish processing
      if (uploadedFiles.length > 0) {
        logger.info('Waiting for uploads to complete processing...');
        await playwrightService.randomDelay(2000, 3000);
      }
      
      // Clean up temp files
      logger.info('Cleaning up temporary files...');
      for (const filepath of uploadedFiles) {
        try {
          if (fsSync.existsSync(filepath)) {
            await fs.unlink(filepath);
            logger.info(`Deleted temp file: ${path.basename(filepath)}`);
          }
        } catch (e) {
          logger.warn(`Could not delete temp file: ${filepath}`, { error: e.message });
        }
      }
      
      if (uploadedFiles.length === 0) {
        return { success: false, error: 'No images could be uploaded' };
      }
      
      logger.info(`✓ Successfully uploaded ${uploadedFiles.length} photo(s)`);
      return { success: true, uploadedCount: uploadedFiles.length };
      
    } catch (error) {
      logger.error('Photo upload failed', { error: error.message, stack: error.stack });
      return { success: false, error: error.message };
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
