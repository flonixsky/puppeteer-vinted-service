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

    // Navigate through category hierarchy
    // NOTE: Vinted does NOT use a dropdown! Categories are displayed directly on the page
    const pathParts = vintedCategory.full_path.split(' → ');
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

      // Wait for next level to load (page transition or modal update)
      await playwrightService.randomDelay(1500, 2000);
    }

    // Wait for category to be fully selected (form updates)
    await playwrightService.randomDelay(2000, 2500);
    
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
    // Wait for any animations/loading
    await playwrightService.randomDelay(800, 1200);
    
    const strategies = [
      {
        name: 'data-testid first-category (Vinted-specific)',
        action: async () => {
          // Vinted uses data-testid="first-category-*" for first level categories
          const elements = await page.locator('[data-testid^="first-category-"]').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  logger.info(`  Found via data-testid: ${await element.getAttribute('data-testid')}`);
                  await element.click();
                  await playwrightService.randomDelay(1000, 1500);
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
          // Try any element with category-related data-testid
          const elements = await page.locator('[data-testid*="category"]').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  logger.info(`  Found via data-testid: ${await element.getAttribute('data-testid')}`);
                  await element.click();
                  await playwrightService.randomDelay(1000, 1500);
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
        name: 'getByText exact match',
        action: async () => {
          // Find all elements with exact text match
          const elements = await page.getByText(categoryName, { exact: true }).all();
          
          // Try each one (there might be multiple, e.g., in different menus)
          for (const element of elements) {
            try {
              await element.waitFor({ state: 'visible', timeout: 3000 });
              
              // Check if it's actually visible and not hidden
              const isVisible = await element.isVisible();
              if (isVisible) {
                await element.click();
                logger.info(`  Clicked visible element with exact text: ${categoryName}`);
                
                // Wait for next level to load
                await playwrightService.randomDelay(1000, 1500);
                return true;
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'getByRole button with name',
        action: async () => {
          const elements = await page.getByRole('button', { name: categoryName, exact: true }).all();
          
          for (const element of elements) {
            try {
              await element.waitFor({ state: 'visible', timeout: 3000 });
              const isVisible = await element.isVisible();
              if (isVisible) {
                await element.click();
                await playwrightService.randomDelay(1000, 1500);
                return true;
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'getByRole option with name',
        action: async () => {
          const elements = await page.getByRole('option', { name: categoryName, exact: true }).all();
          
          for (const element of elements) {
            try {
              await element.waitFor({ state: 'visible', timeout: 3000 });
              const isVisible = await element.isVisible();
              if (isVisible) {
                await element.click();
                await playwrightService.randomDelay(1000, 1500);
                return true;
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'Text with partial match (case insensitive)',
        action: async () => {
          const regex = new RegExp(`^${categoryName}$`, 'i');
          const elements = await page.getByText(regex).all();
          
          for (const element of elements) {
            try {
              await element.waitFor({ state: 'visible', timeout: 3000 });
              const isVisible = await element.isVisible();
              if (isVisible) {
                await element.click();
                await playwrightService.randomDelay(1000, 1500);
                return true;
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'Locator with text content (visible only)',
        action: async () => {
          // Get all matching elements
          const elements = await page.locator(`button:has-text("${categoryName}"), a:has-text("${categoryName}"), div[role="button"]:has-text("${categoryName}")`).all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                // Make sure it's an exact match (not just contains)
                if (text && text.trim() === categoryName) {
                  await element.click();
                  await playwrightService.randomDelay(1000, 1500);
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
        name: 'List item with exact text',
        action: async () => {
          const elements = await page.locator(`li`).all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  await element.click();
                  await playwrightService.randomDelay(1000, 1500);
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
        name: 'Any clickable element with exact text',
        action: async () => {
          // Last resort: find ANY element with exact text that might be clickable
          const elements = await page.locator('*').all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  // Check if it looks clickable
                  const tagName = await element.evaluate(el => el.tagName.toLowerCase());
                  if (['button', 'a', 'li', 'div'].includes(tagName)) {
                    await element.click();
                    await playwrightService.randomDelay(1000, 1500);
                    return true;
                  }
                }
              }
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      }
    ];

    for (const strategy of strategies) {
      logger.info(`  Trying to select "${categoryName}" with: ${strategy.name}`);
      
      try {
        const result = await strategy.action();
        if (result) {
          logger.info(`  ✓ Selected "${categoryName}" with: ${strategy.name}`);
          
          // Extra wait for next level to fully load
          await playwrightService.randomDelay(500, 800);
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
