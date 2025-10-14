const playwrightService = require('./playwright');
const logger = require('../utils/logger');

/**
 * Dedicated service for handling Vinted category selection
 * Uses multiple strategies to find and navigate the category dropdown
 */
class CategorySelectorService {
  
  /**
   * Main entry point - tries multiple strategies to select a category
   */
  async selectCategory(page, vintedCategory) {
    logger.info('Starting category selection', {
      path: vintedCategory.full_path,
      depth: vintedCategory.depth
    });

    // Take initial screenshot
    const screenshotBefore = await playwrightService.takeScreenshot(page);
    logger.info('Screenshot before category selection taken');

    // Try to open the category dropdown with multiple strategies
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

    // Navigate through category hierarchy
    const pathParts = vintedCategory.full_path.split(' > ');
    logger.info('Navigating through category path', { parts: pathParts });

    for (let i = 0; i < pathParts.length; i++) {
      const categoryName = pathParts[i].trim();
      logger.info(`Selecting category level ${i + 1}/${pathParts.length}: ${categoryName}`);

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

      await playwrightService.randomDelay(800, 1200);
    }

    // Wait for category to be fully selected (form updates)
    await playwrightService.randomDelay(1500, 2000);
    
    // Take final screenshot
    const screenshotAfter = await playwrightService.takeScreenshot(page);
    
    logger.info('Category selection completed successfully');
    return {
      success: true,
      screenshotBefore: screenshotBefore,
      screenshotAfter: screenshotAfter
    };
  }

  /**
   * Try multiple strategies to open the category dropdown
   */
  async openCategoryDropdown(page) {
    const strategies = [
      {
        name: 'getByText with exact "Wähle eine Kategorie"',
        action: async () => {
          const element = page.getByText('Wähle eine Kategorie', { exact: true });
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'getByText with partial "Kategorie"',
        action: async () => {
          const element = page.getByText('Kategorie', { exact: false }).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'getByPlaceholder',
        action: async () => {
          const element = page.getByPlaceholder(/kategorie/i).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'getByLabel',
        action: async () => {
          const element = page.getByLabel(/kategorie/i).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'data-testid selectors',
        action: async () => {
          const selectors = [
            '[data-testid="catalog-select"]',
            '[data-testid="category-select"]',
            '[data-testid*="catalog"]',
            '[data-testid*="category"]'
          ];
          
          for (const selector of selectors) {
            try {
              const element = page.locator(selector).first();
              await element.waitFor({ state: 'visible', timeout: 3000 });
              await element.click();
              return true;
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'Role-based selectors',
        action: async () => {
          const element = page.getByRole('button', { name: /kategorie|katalog/i }).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'Combobox role',
        action: async () => {
          const element = page.getByRole('combobox').first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'CSS class-based selectors',
        action: async () => {
          const selectors = [
            'button[class*="catalog"]',
            'button[class*="category"]',
            'div[class*="catalog"] button',
            'div[class*="category-select"]',
            '.category-selector button'
          ];
          
          for (const selector of selectors) {
            try {
              const element = page.locator(selector).first();
              await element.waitFor({ state: 'visible', timeout: 3000 });
              await element.click();
              return true;
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'Find by form position (first clickable in form)',
        action: async () => {
          // Find the upload form
          const forms = await page.locator('form').all();
          
          for (const form of forms) {
            const text = await form.textContent();
            if (text?.includes('Kategorie') || text?.includes('Titel')) {
              // This is the upload form, find first button/clickable
              const buttons = form.locator('button, [role="button"], div[class*="select"]');
              const first = buttons.first();
              
              try {
                await first.waitFor({ state: 'visible', timeout: 3000 });
                await first.click();
                return true;
              } catch (e) {
                continue;
              }
            }
          }
          return false;
        }
      }
    ];

    // Try each strategy
    for (const strategy of strategies) {
      logger.info(`Trying strategy: ${strategy.name}`);
      
      try {
        const result = await strategy.action();
        if (result) {
          logger.info(`✓ Strategy succeeded: ${strategy.name}`);
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
   * Select a category at a specific level in the hierarchy
   */
  async selectCategoryLevel(page, categoryName, level) {
    const strategies = [
      {
        name: 'getByText exact match',
        action: async () => {
          const element = page.getByText(categoryName, { exact: true });
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'getByRole button with name',
        action: async () => {
          const element = page.getByRole('button', { name: categoryName, exact: true });
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'getByRole option with name',
        action: async () => {
          const element = page.getByRole('option', { name: categoryName, exact: true });
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'Text with partial match (case insensitive)',
        action: async () => {
          const regex = new RegExp(categoryName, 'i');
          const element = page.getByText(regex).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'Locator with text content',
        action: async () => {
          const element = page.locator(`button:has-text("${categoryName}")`).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      },
      {
        name: 'List item with text',
        action: async () => {
          const element = page.locator(`li:has-text("${categoryName}")`).first();
          await element.waitFor({ state: 'visible', timeout: 5000 });
          await element.click();
          return true;
        }
      }
    ];

    for (const strategy of strategies) {
      logger.info(`  Trying to select "${categoryName}" with: ${strategy.name}`);
      
      try {
        const result = await strategy.action();
        if (result) {
          logger.info(`  ✓ Selected "${categoryName}" with: ${strategy.name}`);
          return true;
        }
      } catch (error) {
        logger.debug(`  ✗ Failed with: ${strategy.name}`, { 
          error: error.message 
        });
        continue;
      }
    }

    logger.error(`Could not select category: ${categoryName} at level ${level}`);
    return false;
  }
}

module.exports = new CategorySelectorService();
