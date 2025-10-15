const playwrightService = require('./playwright');
const logger = require('../utils/logger');

/**
 * Dedicated service for handling Vinted category selection
 * FIXED: Now clicks the readonly category input to open dropdown modal
 * instead of clicking navigation links
 */
class CategorySelectorService {
  
  /**
   * Main entry point - opens category dropdown then navigates through categories
   */
  async selectCategory(page, vintedCategory) {
    logger.info('Starting category selection', {
      path: vintedCategory.full_path,
      depth: vintedCategory.depth
    });

    // Check current URL - must be on /items/new
    const currentUrl = page.url();
    if (!currentUrl.includes('/items/new')) {
      logger.error('Not on upload page!', { url: currentUrl });
      return {
        success: false,
        error: `Wrong page: ${currentUrl}. Expected /items/new`
      };
    }

    // Take initial screenshot
    const screenshotBefore = await playwrightService.takeScreenshot(page);
    logger.info('Screenshot before category selection taken');

    // STEP 1: Click the category input field to open the dropdown/modal
    const dropdownOpened = await this.openCategoryDropdown(page);
    if (!dropdownOpened) {
      logger.error('Failed to open category dropdown');
      const errorScreenshot = await playwrightService.takeScreenshot(page);
      return {
        success: false,
        error: 'Could not open category dropdown',
        screenshot: errorScreenshot
      };
    }

    logger.info('Category dropdown opened successfully');
    await playwrightService.randomDelay(1000, 1500);

    // STEP 2: Navigate through category hierarchy within the modal
    const pathParts = vintedCategory.full_path.split(' → ');
    logger.info('Navigating through category path', { parts: pathParts });

    for (let i = 0; i < pathParts.length; i++) {
      const categoryName = pathParts[i].trim();
      logger.info(`Selecting category level ${i + 1}/${pathParts.length}: ${categoryName}`);

      // Verify we're still on /items/new
      const url = page.url();
      if (!url.includes('/items/new')) {
        logger.error('Navigation detected - left upload page!', { url });
        return {
          success: false,
          error: `Navigated away from upload page to: ${url}`,
          level: i + 1
        };
      }

      const selected = await this.selectCategoryLevel(page, categoryName, i);
      
      if (!selected) {
        logger.error(`Failed to select category: ${categoryName}`);
        const errorScreenshot = await playwrightService.takeScreenshot(page);
        return {
          success: false,
          error: `Could not find category: ${categoryName}`,
          level: i + 1,
          screenshot: errorScreenshot
        };
      }

      // Wait for next level to load (modal update, not page navigation)
      await playwrightService.randomDelay(1500, 2000);
    }

    // Wait for category to be fully selected (form updates)
    await playwrightService.randomDelay(2000, 2500);
    
    // Final check - should still be on /items/new
    const finalUrl = page.url();
    if (!finalUrl.includes('/items/new')) {
      logger.error('Category selection caused navigation!', { 
        finalUrl,
        expected: '/items/new'
      });
      return {
        success: false,
        error: `Navigation occurred during category selection: ${finalUrl}`
      };
    }
    
    // Take final screenshot
    const screenshotAfter = await playwrightService.takeScreenshot(page);
    
    logger.info('Category selection completed successfully - still on upload page');
    return {
      success: true,
      screenshotBefore: screenshotBefore,
      screenshotAfter: screenshotAfter
    };
  }

  /**
   * Open the category dropdown by clicking the readonly input field
   * This is the KEY FIX - click the FORM input, not navigation links!
   */
  async openCategoryDropdown(page) {
    const strategies = [
      {
        name: 'data-testid catalog-select-dropdown-input',
        action: async () => {
          const element = page.locator('[data-testid="catalog-select-dropdown-input"]').first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          
          // Verify it's on the upload form (not navigation)
          const url = page.url();
          if (!url.includes('/items/new')) {
            logger.warn('Wrong page for category input');
            return false;
          }
          
          await element.click();
          logger.info('Clicked category input field via data-testid');
          
          // Wait for modal/dropdown to appear
          await playwrightService.randomDelay(500, 800);
          return true;
        }
      },
      {
        name: 'ID selector #category',
        action: async () => {
          const element = page.locator('#category').first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          
          // Verify readonly attribute (confirms it's the form field)
          const isReadonly = await element.getAttribute('readonly');
          if (isReadonly === null) {
            logger.warn('Category field is not readonly - might be wrong element');
          }
          
          await element.click();
          logger.info('Clicked category input field via #category');
          await playwrightService.randomDelay(500, 800);
          return true;
        }
      },
      {
        name: 'Input with placeholder "Wähle eine Kategorie"',
        action: async () => {
          const element = page.locator('input[placeholder="Wähle eine Kategorie"]').first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          
          // Make sure it's readonly (not a real select)
          const isReadonly = await element.getAttribute('readonly');
          if (isReadonly === null) {
            logger.warn('Found input but not readonly');
          }
          
          await element.click();
          logger.info('Clicked category input via placeholder');
          await playwrightService.randomDelay(500, 800);
          return true;
        }
      },
      {
        name: 'Input with name="category"',
        action: async () => {
          const element = page.locator('input[name="category"]').first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          logger.info('Clicked category input via name attribute');
          await playwrightService.randomDelay(500, 800);
          return true;
        }
      },
      {
        name: 'Readonly input with cursor pointer',
        action: async () => {
          const element = page.locator('input[readonly].u-cursor-pointer').first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          logger.info('Clicked readonly input with cursor pointer');
          await playwrightService.randomDelay(500, 800);
          return true;
        }
      }
    ];

    // Try each strategy
    for (const strategy of strategies) {
      logger.info(`Trying to open dropdown: ${strategy.name}`);
      
      try {
        const result = await strategy.action();
        if (result) {
          logger.info(`✓ Dropdown opened with: ${strategy.name}`);
          
          // Verify we're still on /items/new
          const url = page.url();
          if (!url.includes('/items/new')) {
            logger.error('Opening dropdown caused navigation!', { url });
            return false;
          }
          
          return true;
        }
      } catch (error) {
        logger.warn(`✗ Strategy failed: ${strategy.name}`, { 
          error: error.message 
        });
        continue;
      }
    }

    logger.error('All strategies failed to open category dropdown');
    return false;
  }

  /**
   * Select a category at a specific level within the modal/dropdown
   * Important: These are NOT navigation links, they're modal options!
   */
  async selectCategoryLevel(page, categoryName, level) {
    // Wait for any animations/loading
    await playwrightService.randomDelay(800, 1200);
    
    const strategies = [
      {
        name: 'data-testid first-category (level 0)',
        action: async () => {
          // First level uses data-testid="first-category-*"
          if (level !== 0) return false;
          
          const elements = await page.locator('[data-testid^="first-category-"]').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  logger.info(`  Found via first-category data-testid`);
                  await element.click();
                  return true;
                }
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'data-testid second-category (level 1)',
        action: async () => {
          // Second level uses data-testid="second-category-*"
          if (level !== 1) return false;
          
          const elements = await page.locator('[data-testid^="second-category-"]').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  logger.info(`  Found via second-category data-testid`);
                  await element.click();
                  return true;
                }
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'data-testid category (any level)',
        action: async () => {
          const elements = await page.locator('[data-testid*="category"]').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  // Make sure it's not a navigation link
                  const href = await element.getAttribute('href');
                  if (href && href.includes('/catalog')) {
                    logger.warn('  Skipping - this is a navigation link, not modal option');
                    continue;
                  }
                  
                  logger.info(`  Found via data-testid: ${await element.getAttribute('data-testid')}`);
                  await element.click();
                  return true;
                }
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'Buttons/divs in modal (not links)',
        action: async () => {
          // Look for buttons or divs (modal options), NOT <a> tags (navigation)
          const elements = await page.locator('button, div[role="button"], div[class*="option"]').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  // Extra check: make sure it's not a link wrapper
                  const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                  if (tagName === 'a') {
                    logger.warn('  Skipping <a> tag - navigation link');
                    continue;
                  }
                  
                  logger.info(`  Found modal option: ${categoryName}`);
                  await element.click();
                  return true;
                }
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'List items in modal (exclude links)',
        action: async () => {
          const elements = await page.locator('li, [role="option"]').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  // Check if it contains a link
                  const hasLink = await element.locator('a').count() > 0;
                  if (hasLink) {
                    logger.warn('  Skipping list item with link');
                    continue;
                  }
                  
                  logger.info(`  Found modal list item: ${categoryName}`);
                  await element.click();
                  return true;
                }
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'getByText exact match (filtered)',
        action: async () => {
          const elements = await page.getByText(categoryName, { exact: true }).all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (!isVisible) continue;
              
              // Get the element's tag and attributes
              const tagName = await element.evaluate(el => el.tagName.toLowerCase());
              const href = await element.getAttribute('href');
              
              // Skip if it's a navigation link
              if (tagName === 'a' && href) {
                logger.warn('  Skipping navigation link');
                continue;
              }
              
              // Skip if it's in the top navigation bar
              const classes = await element.getAttribute('class') || '';
              if (classes.includes('nav') || classes.includes('menu') || classes.includes('header')) {
                logger.warn('  Skipping navigation element');
                continue;
              }
              
              await element.click();
              logger.info(`  Clicked element with exact text (filtered)`);
              return true;
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      }
    ];

    for (const strategy of strategies) {
      logger.info(`  Trying: ${strategy.name}`);
      
      try {
        const result = await strategy.action();
        if (result) {
          logger.info(`  ✓ Selected "${categoryName}" with: ${strategy.name}`);
          
          // Verify we're still on /items/new
          await playwrightService.randomDelay(300, 500);
          const url = page.url();
          if (!url.includes('/items/new')) {
            logger.error('  Category selection caused navigation!', { url });
            return false;
          }
          
          return true;
        }
      } catch (error) {
        logger.debug(`  ✗ Failed: ${strategy.name}`, { 
          error: error.message 
        });
        continue;
      }
    }

    logger.error(`Could not select category: ${categoryName} at level ${level}`);
    
    // Take debug screenshot
    try {
      const debugScreenshot = await playwrightService.takeScreenshot(page);
      logger.info('Debug screenshot taken for failed category selection');
    } catch (e) {
      // Ignore screenshot errors
    }
    
    return false;
  }
}

module.exports = new CategorySelectorService();
