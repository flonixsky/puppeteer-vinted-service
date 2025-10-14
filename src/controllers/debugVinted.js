const vintedService = require('../services/vinted');
const playwrightService = require('../services/playwright');
const supabaseService = require('../services/supabase');
const logger = require('../utils/logger');

class DebugVintedController {
  async inspectUploadForm(req, res) {
    let page = null;
    
    try {
      logger.info('Starting Vinted upload form inspection');
      
      // Get session
      const session = await supabaseService.getActiveSession();
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'No active session found'
        });
      }
      
      // Create page
      page = await playwrightService.createPage(session.user_agent);
      
      // Go to homepage first
      await page.goto('https://www.vinted.de', { waitUntil: 'networkidle', timeout: 30000 });
      await playwrightService.setCookies(page, session.cookies);
      await page.reload({ waitUntil: 'networkidle' });
      
      // Go to upload page
      await page.goto('https://www.vinted.de/items/new', { waitUntil: 'networkidle', timeout: 30000 });
      await playwrightService.randomDelay(2000, 3000);
      
      // Comprehensive analysis - find EVERYTHING related to categories
      const formAnalysis = await page.evaluate(() => {
        const results = {
          allForms: [],
          categoryElements: [],
          clickableElements: [],
          allDivs: [],
          dataTestIds: [],
          ariaElements: []
        };
        
        // 1. Analyze all forms
        const allForms = document.querySelectorAll('form');
        results.allForms = Array.from(allForms).map((form, idx) => ({
          index: idx,
          id: form.id || '',
          action: form.action || '',
          hasCategory: form.textContent.includes('Kategorie') || form.textContent.includes('Wähle'),
          inputCount: form.querySelectorAll('input, textarea, select').length,
          textSample: form.textContent.substring(0, 200).trim()
        }));
        
        // 2. Find ALL elements with "kategorie" or "catalog" (case insensitive)
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
          const text = el.textContent.toLowerCase();
          const className = el.className || '';
          const id = el.id || '';
          const dataTestId = el.getAttribute('data-testid') || '';
          
          // Check for category-related attributes
          if (text.includes('kategorie') || 
              text.includes('catalog') ||
              className.toLowerCase().includes('categor') ||
              className.toLowerCase().includes('catalog') ||
              id.toLowerCase().includes('categor') ||
              id.toLowerCase().includes('catalog') ||
              dataTestId.toLowerCase().includes('categor') ||
              dataTestId.toLowerCase().includes('catalog')) {
            
            results.categoryElements.push({
              tag: el.tagName,
              type: el.type || '',
              id: id,
              className: className,
              dataTestId: dataTestId,
              text: el.textContent.trim().substring(0, 100),
              role: el.getAttribute('role') || '',
              ariaLabel: el.getAttribute('aria-label') || '',
              clickable: el.onclick !== null || el.tagName === 'BUTTON' || el.tagName === 'A'
            });
          }
        }
        
        // 3. Find all clickable elements in forms
        const clickables = document.querySelectorAll('form button, form [role="button"], form [onclick], form a');
        results.clickableElements = Array.from(clickables).map(el => ({
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 100),
          className: el.className || '',
          id: el.id || '',
          role: el.getAttribute('role') || '',
          type: el.type || ''
        })).filter(e => e.text.length > 0);
        
        // 4. Find all divs that might be dropdowns
        const potentialDropdowns = document.querySelectorAll('div[role="combobox"], div[role="listbox"], div[class*="select"], div[class*="dropdown"]');
        results.allDivs = Array.from(potentialDropdowns).map(el => ({
          className: el.className || '',
          id: el.id || '',
          role: el.getAttribute('role') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          text: el.textContent.trim().substring(0, 100)
        }));
        
        // 5. All data-testid attributes
        const elementsWithTestId = document.querySelectorAll('[data-testid]');
        results.dataTestIds = Array.from(elementsWithTestId).map(el => ({
          testId: el.getAttribute('data-testid'),
          tag: el.tagName,
          text: el.textContent.trim().substring(0, 100)
        }));
        
        // 6. All elements with aria-label
        const ariaElements = document.querySelectorAll('[aria-label]');
        results.ariaElements = Array.from(ariaElements).map(el => ({
          ariaLabel: el.getAttribute('aria-label'),
          tag: el.tagName,
          className: el.className || '',
          role: el.getAttribute('role') || ''
        }));
        
        return results;
      });
      
      // Try to find and analyze the category field interactively
      const categoryFieldTest = await page.evaluate(() => {
        // Try to find the exact text "Wähle eine Kategorie"
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          null
        );
        
        const textNodes = [];
        let node;
        while (node = walker.nextNode()) {
          const text = node.textContent.trim();
          if (text === 'Wähle eine Kategorie' || 
              text.includes('Kategorie') ||
              text === 'Katalog') {
            textNodes.push({
              text: text,
              parentTag: node.parentElement?.tagName,
              parentClass: node.parentElement?.className || '',
              parentId: node.parentElement?.id || '',
              clickable: node.parentElement?.onclick !== null ||
                         node.parentElement?.tagName === 'BUTTON' ||
                         node.parentElement?.tagName === 'A'
            });
          }
        }
        
        return { textNodes };
      });
      
      // Take screenshot
      const screenshot = await playwrightService.takeScreenshot(page);
      
      await playwrightService.closeBrowser();
      
      res.status(200).json({
        success: true,
        analysis: formAnalysis,
        categoryFieldTest: categoryFieldTest,
        screenshot: screenshot,
        summary: {
          totalForms: formAnalysis.allForms.length,
          categoryElements: formAnalysis.categoryElements.length,
          clickableElements: formAnalysis.clickableElements.length,
          dataTestIds: formAnalysis.dataTestIds.length
        }
      });
      
    } catch (error) {
      logger.error('Form inspection failed', { error: error.message });
      
      if (page) {
        const errorScreenshot = await playwrightService.takeScreenshot(page);
        await playwrightService.closeBrowser();
        
        return res.status(500).json({
          success: false,
          error: error.message,
          screenshot: errorScreenshot
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
  
  /**
   * NEW: Interactive category test - try to click and see what happens
   */
  async testCategoryClick(req, res) {
    let page = null;
    
    try {
      logger.info('Starting interactive category test');
      
      // Get session
      const session = await supabaseService.getActiveSession();
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'No active session found'
        });
      }
      
      // Create page
      page = await playwrightService.createPage(session.user_agent);
      
      // Go to homepage first
      await page.goto('https://www.vinted.de', { waitUntil: 'networkidle', timeout: 30000 });
      await playwrightService.setCookies(page, session.cookies);
      await page.reload({ waitUntil: 'networkidle' });
      
      // Go to upload page
      await page.goto('https://www.vinted.de/items/new', { waitUntil: 'networkidle', timeout: 30000 });
      await playwrightService.randomDelay(2000, 3000);
      
      const screenshotBefore = await playwrightService.takeScreenshot(page);
      
      // Try different strategies to find and click category
      const strategies = [];
      
      // Strategy 1: Click any element containing "Wähle eine Kategorie"
      try {
        await page.getByText('Wähle eine Kategorie').click({ timeout: 3000 });
        strategies.push({ name: 'getByText exact', success: true });
        await playwrightService.randomDelay(1000, 2000);
      } catch (e) {
        strategies.push({ name: 'getByText exact', success: false, error: e.message });
      }
      
      const screenshotAfter1 = await playwrightService.takeScreenshot(page);
      
      // Strategy 2: Click button/div with "Kategorie" in text (partial match)
      try {
        await page.getByText('Kategorie', { exact: false }).first().click({ timeout: 3000 });
        strategies.push({ name: 'getByText partial', success: true });
        await playwrightService.randomDelay(1000, 2000);
      } catch (e) {
        strategies.push({ name: 'getByText partial', success: false, error: e.message });
      }
      
      const screenshotAfter2 = await playwrightService.takeScreenshot(page);
      
      // Strategy 3: Find by placeholder
      try {
        await page.getByPlaceholder('Kategorie', { exact: false }).click({ timeout: 3000 });
        strategies.push({ name: 'getByPlaceholder', success: true });
        await playwrightService.randomDelay(1000, 2000);
      } catch (e) {
        strategies.push({ name: 'getByPlaceholder', success: false, error: e.message });
      }
      
      const screenshotAfter3 = await playwrightService.takeScreenshot(page);
      
      // Strategy 4: CSS selectors
      const selectors = [
        '[data-testid*="catalog"]',
        '[data-testid*="category"]',
        'button[class*="catalog"]',
        'div[class*="catalog"]',
        'input[name*="catalog"]'
      ];
      
      for (const selector of selectors) {
        try {
          await page.locator(selector).first().click({ timeout: 2000 });
          strategies.push({ name: `selector: ${selector}`, success: true });
          await playwrightService.randomDelay(1000, 2000);
          break;
        } catch (e) {
          strategies.push({ name: `selector: ${selector}`, success: false, error: e.message });
        }
      }
      
      const screenshotFinal = await playwrightService.takeScreenshot(page);
      
      await playwrightService.closeBrowser();
      
      res.status(200).json({
        success: true,
        strategies: strategies,
        screenshots: {
          before: screenshotBefore,
          after1: screenshotAfter1,
          after2: screenshotAfter2,
          after3: screenshotAfter3,
          final: screenshotFinal
        }
      });
      
    } catch (error) {
      logger.error('Category test failed', { error: error.message });
      
      if (page) {
        const errorScreenshot = await playwrightService.takeScreenshot(page);
        await playwrightService.closeBrowser();
        
        return res.status(500).json({
          success: false,
          error: error.message,
          screenshot: errorScreenshot
        });
      }
      
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}

module.exports = new DebugVintedController();
