const playwrightService = require('./playwright');
const logger = require('../utils/logger');

/**
 * Generic service for handling Vinted's custom form fields
 * These fields LOOK like dropdowns but are actually custom UI components
 * Pattern: Click button/field → Modal/Menu opens → Select option
 * 
 * Used for: Category, Brand, Size, Condition, Color
 */
class FormFieldSelector {
  
  /**
   * Select a value in a custom form field
   * @param {Page} page - Playwright page object
   * @param {string} fieldType - Type of field: 'category', 'brand', 'size', 'condition', 'color'
   * @param {string|array} value - Value to select (array for hierarchical like category)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async selectField(page, fieldType, value) {
    logger.info(`Selecting ${fieldType}`, { value });
    
    try {
      // CRITICAL: Make sure we're on /items/new
      const currentUrl = page.url();
      if (!currentUrl.includes('/items/new')) {
        logger.error(`Wrong page! Expected /items/new, got: ${currentUrl}`);
        return { 
          success: false, 
          error: `Wrong page: ${currentUrl}. Must be on /items/new` 
        };
      }
      
      // Step 1: Find and click the field button to open modal/menu
      const buttonClicked = await this.openFieldModal(page, fieldType);
      
      if (!buttonClicked) {
        return { 
          success: false, 
          error: `Could not open ${fieldType} field modal` 
        };
      }
      
      // Wait for modal/menu to open
      await playwrightService.randomDelay(800, 1200);
      
      // Step 2: Select the value(s)
      if (fieldType === 'category' && Array.isArray(value)) {
        // Category has hierarchical selection
        return await this.selectCategoryHierarchy(page, value);
      } else {
        // Simple single selection
        return await this.selectOption(page, fieldType, value);
      }
      
    } catch (error) {
      logger.error(`Error selecting ${fieldType}`, { 
        error: error.message,
        stack: error.stack 
      });
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Open the field modal/menu by clicking the field button
   * SCOPED TO FORM ONLY - avoids clicking navigation links!
   */
  async openFieldModal(page, fieldType) {
    logger.info(`Opening ${fieldType} field modal...`);
    
    // STRATEGY: Find the FORM first, then search within it
    // This prevents clicking navigation links!
    
    try {
      // Get the upload form (contains all fields)
      const uploadForm = await this.findUploadForm(page);
      
      if (!uploadForm) {
        logger.error('Could not find upload form on page');
        return false;
      }
      
      logger.info('Upload form found, searching for field within form context');
      
      // Define field-specific search patterns
      const fieldPatterns = {
        category: {
          textMatches: ['Wähle eine Kategorie', 'Kategorie', 'Katalog'],
          dataTestIds: ['catalog-select', 'category-select'],
          placeholders: ['Kategorie', 'Katalog']
        },
        brand: {
          textMatches: ['Marke', 'Brand'],
          dataTestIds: ['brand-select', 'brand-input'],
          placeholders: ['Marke', 'Brand']
        },
        size: {
          textMatches: ['Größe', 'Size'],
          dataTestIds: ['size-select'],
          placeholders: ['Größe', 'Size']
        },
        condition: {
          textMatches: ['Zustand', 'Condition', 'Status'],
          dataTestIds: ['condition-select', 'status-select'],
          placeholders: ['Zustand', 'Condition']
        },
        color: {
          textMatches: ['Farbe', 'Color'],
          dataTestIds: ['color-select'],
          placeholders: ['Farbe', 'Color']
        }
      };
      
      const patterns = fieldPatterns[fieldType];
      
      if (!patterns) {
        logger.error(`Unknown field type: ${fieldType}`);
        return false;
      }
      
      // Try multiple strategies to find the field button WITHIN the form
      const strategies = [
        {
          name: 'Form-scoped button by text',
          action: async () => {
            for (const text of patterns.textMatches) {
              try {
                // Search within uploadForm scope
                const button = uploadForm.getByText(text, { exact: false }).first();
                await button.waitFor({ state: 'visible', timeout: 3000 });
                
                // Verify it's clickable (button or has role)
                const role = await button.getAttribute('role');
                const tagName = await button.evaluate(el => el.tagName.toLowerCase());
                
                if (tagName === 'button' || role === 'button' || tagName === 'div') {
                  logger.info(`Found field button with text: "${text}"`);
                  await button.click();
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
          name: 'Form-scoped data-testid',
          action: async () => {
            for (const testId of patterns.dataTestIds) {
              try {
                const button = uploadForm.locator(`[data-testid="${testId}"]`).first();
                await button.waitFor({ state: 'visible', timeout: 3000 });
                logger.info(`Found field button with testId: ${testId}`);
                await button.click();
                return true;
              } catch (e) {
                continue;
              }
            }
            return false;
          }
        },
        {
          name: 'Form-scoped placeholder',
          action: async () => {
            for (const placeholder of patterns.placeholders) {
              try {
                const input = uploadForm.getByPlaceholder(placeholder, { exact: false }).first();
                await input.waitFor({ state: 'visible', timeout: 3000 });
                logger.info(`Found field input with placeholder: ${placeholder}`);
                
                // Click the input or its parent button
                await input.click();
                return true;
              } catch (e) {
                continue;
              }
            }
            return false;
          }
        },
        {
          name: 'Form-scoped label',
          action: async () => {
            for (const text of patterns.textMatches) {
              try {
                const label = uploadForm.getByLabel(text, { exact: false }).first();
                await label.waitFor({ state: 'visible', timeout: 3000 });
                logger.info(`Found field by label: ${text}`);
                await label.click();
                return true;
              } catch (e) {
                continue;
              }
            }
            return false;
          }
        }
      ];
      
      // Try each strategy
      for (const strategy of strategies) {
        logger.info(`Trying: ${strategy.name}`);
        try {
          const result = await strategy.action();
          if (result) {
            logger.info(`✓ ${strategy.name} succeeded`);
            return true;
          }
        } catch (error) {
          logger.debug(`✗ ${strategy.name} failed: ${error.message}`);
          continue;
        }
      }
      
      logger.error(`All strategies failed for ${fieldType}`);
      return false;
      
    } catch (error) {
      logger.error(`Error opening ${fieldType} modal`, { error: error.message });
      return false;
    }
  }
  
  /**
   * Find the upload form on the page
   * Returns a Locator scoped to the form
   */
  async findUploadForm(page) {
    // Try multiple ways to find the upload form
    const strategies = [
      {
        name: 'Form with "Titel" text',
        action: async () => {
          const forms = await page.locator('form').all();
          for (const form of forms) {
            const text = await form.textContent();
            if (text.includes('Titel') || text.includes('Beschreibung') || text.includes('Preis')) {
              logger.info('Found upload form by content (Titel/Beschreibung/Preis)');
              return form;
            }
          }
          return null;
        }
      },
      {
        name: 'Form by action',
        action: async () => {
          const form = page.locator('form[action*="items"]').first();
          try {
            await form.waitFor({ state: 'attached', timeout: 3000 });
            logger.info('Found upload form by action attribute');
            return form;
          } catch (e) {
            return null;
          }
        }
      },
      {
        name: 'Main form on /items/new',
        action: async () => {
          const form = page.locator('form').first();
          try {
            await form.waitFor({ state: 'attached', timeout: 3000 });
            logger.info('Using first form on page');
            return form;
          } catch (e) {
            return null;
          }
        }
      }
    ];
    
    for (const strategy of strategies) {
      try {
        const result = await strategy.action();
        if (result) {
          return result;
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  }
  
  /**
   * Select a category through hierarchical navigation
   * e.g., ["Damen", "Kleidung", "Tops & T-Shirts", "T-Shirts"]
   */
  async selectCategoryHierarchy(page, pathParts) {
    logger.info('Navigating category hierarchy', { parts: pathParts });
    
    for (let i = 0; i < pathParts.length; i++) {
      const categoryName = pathParts[i].trim();
      logger.info(`Selecting category level ${i + 1}/${pathParts.length}: ${categoryName}`);
      
      const selected = await this.selectCategoryLevel(page, categoryName, i);
      
      if (!selected) {
        logger.error(`Failed to select category: ${categoryName}`);
        return {
          success: false,
          error: `Could not find category: ${categoryName} at level ${i + 1}`,
          level: i + 1
        };
      }
      
      // Wait for next level to load
      await playwrightService.randomDelay(1000, 1500);
      
      // Verify we're still on /items/new
      const currentUrl = page.url();
      if (!currentUrl.includes('/items/new')) {
        logger.error(`Navigation detected! URL changed to: ${currentUrl}`);
        return {
          success: false,
          error: `Navigated away from /items/new to ${currentUrl}`,
          level: i + 1
        };
      }
    }
    
    logger.info('Category hierarchy selection completed');
    await playwrightService.randomDelay(1500, 2000);
    
    return { success: true };
  }
  
  /**
   * Select a specific category level (helper for hierarchy)
   */
  async selectCategoryLevel(page, categoryName, level) {
    const strategies = [
      {
        name: 'data-testid (Vinted-specific)',
        action: async () => {
          // Try level-specific first
          const testIdPatterns = [
            `[data-testid^="first-category-"]`,
            `[data-testid^="second-category-"]`,
            `[data-testid*="category"]`
          ];
          
          for (const pattern of testIdPatterns) {
            const elements = await page.locator(pattern).all();
            
            for (const element of elements) {
              try {
                const isVisible = await element.isVisible();
                if (!isVisible) continue;
                
                const text = await element.textContent();
                if (text && text.trim() === categoryName) {
                  const testId = await element.getAttribute('data-testid');
                  logger.info(`Found via data-testid: ${testId}`);
                  await element.click();
                  await playwrightService.randomDelay(500, 800);
                  return true;
                }
              } catch (e) {
                continue;
              }
            }
          }
          return false;
        }
      },
      {
        name: 'Exact text match',
        action: async () => {
          const elements = await page.getByText(categoryName, { exact: true }).all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (!isVisible) continue;
              
              // Make sure it's not a navigation link
              const href = await element.getAttribute('href');
              if (href && href.includes('/catalog')) {
                logger.debug('Skipping - this is a navigation link');
                continue;
              }
              
              await element.click();
              logger.info(`Clicked element with exact text: ${categoryName}`);
              await playwrightService.randomDelay(500, 800);
              return true;
            } catch (e) {
              continue;
            }
          }
          return false;
        }
      },
      {
        name: 'Button role with name',
        action: async () => {
          const elements = await page.getByRole('button', { name: categoryName, exact: true }).all();
          
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (!isVisible) continue;
              
              await element.click();
              await playwrightService.randomDelay(500, 800);
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
      logger.info(`Trying: ${strategy.name}`);
      try {
        const result = await strategy.action();
        if (result) {
          logger.info(`✓ Selected "${categoryName}" with: ${strategy.name}`);
          return true;
        }
      } catch (error) {
        logger.debug(`✗ Failed: ${strategy.name}`, { error: error.message });
        continue;
      }
    }
    
    return false;
  }
  
  /**
   * Select a simple option (for brand, size, condition, color)
   */
  async selectOption(page, fieldType, value) {
    logger.info(`Selecting ${fieldType} option`, { value });
    
    try {
      // After modal opens, find and click the option
      const strategies = [
        {
          name: 'Exact text match',
          action: async () => {
            const option = page.getByText(value, { exact: true }).first();
            await option.waitFor({ state: 'visible', timeout: 5000 });
            await option.click();
            return true;
          }
        },
        {
          name: 'Option role',
          action: async () => {
            const option = page.getByRole('option', { name: value, exact: true }).first();
            await option.waitFor({ state: 'visible', timeout: 5000 });
            await option.click();
            return true;
          }
        },
        {
          name: 'List item',
          action: async () => {
            const items = await page.locator('li').all();
            for (const item of items) {
              const text = await item.textContent();
              if (text && text.trim() === value) {
                await item.click();
                return true;
              }
            }
            return false;
          }
        }
      ];
      
      for (const strategy of strategies) {
        try {
          const result = await strategy.action();
          if (result) {
            logger.info(`✓ Selected option with: ${strategy.name}`);
            await playwrightService.randomDelay(500, 1000);
            return { success: true };
          }
        } catch (e) {
          continue;
        }
      }
      
      return { 
        success: false, 
        error: `Could not find option: ${value}` 
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new FormFieldSelector();
