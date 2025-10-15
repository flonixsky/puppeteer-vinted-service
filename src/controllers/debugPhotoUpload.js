const vintedService = require('../services/vinted');
const supabaseService = require('../services/supabase');
const playwrightService = require('../services/playwright');
const categorySelector = require('../services/categorySelector');
const logger = require('../utils/logger');

class DebugPhotoUploadController {
  async analyzeUploadPage(req, res) {
    const startTime = Date.now();
    let page = null;
    
    try {
      const { articleId } = req.body;
      
      if (!articleId) {
        return res.status(400).json({
          success: false,
          error: 'articleId is required'
        });
      }
      
      logger.info('Debug: Analyzing upload page after filling fields', { articleId });
      
      const article = await supabaseService.getArticle(articleId);
      if (!article) {
        return res.status(404).json({ success: false, error: 'Article not found' });
      }
      
      const session = await supabaseService.getActiveSession();
      if (!session) {
        return res.status(401).json({ success: false, error: 'No active session' });
      }
      
      page = await playwrightService.createPage(session.user_agent);
      
      // Navigate and set cookies (same as normal flow)
      await page.goto('https://www.vinted.de', { waitUntil: 'networkidle', timeout: 30000 });
      await playwrightService.randomDelay(1000, 2000);
      
      await playwrightService.setCookies(page, session.cookies);
      await page.reload({ waitUntil: 'networkidle' });
      await playwrightService.randomDelay(2000, 3000);
      
      // Navigate to upload page
      await page.goto('https://www.vinted.de/items/new', { waitUntil: 'networkidle', timeout: 30000 });
      await playwrightService.randomDelay(2000, 3000);
      
      // Fill all fields (same as normal flow)
      const title = article.title || 'Test Artikel';
      const description = article.description || 'Test Beschreibung';
      
      await playwrightService.humanType(page, 'input[id="title"], input[name="title"]', title);
      await playwrightService.randomDelay(500, 1000);
      
      await playwrightService.humanType(page, 'textarea[id="description"], textarea[name="description"]', description);
      await playwrightService.randomDelay(500, 1000);
      
      if (article.price_recommended) {
        await playwrightService.humanType(page, 'input[id="price"], input[name="price"]', article.price_recommended.toString());
        await playwrightService.randomDelay(500, 1000);
      }
      
      // Category
      if (article.category || article.ai_analysis?.category) {
        const { findBestCategory } = require('../utils/categoryMapping');
        const categoryName = article.category || article.ai_analysis?.category;
        const gender = article.ai_analysis?.gender;
        const vintedCategory = findBestCategory(categoryName, gender);
        await categorySelector.selectCategory(page, vintedCategory);
        await playwrightService.randomDelay(1000, 2000);
      }
      
      // Brand
      if (article.brand) {
        await playwrightService.humanType(page, 'input[id="brand"], input[name="brand"]', article.brand);
        await playwrightService.randomDelay(500, 1000);
      }
      
      // NOW ANALYZE THE PAGE
      logger.info('All fields filled, now analyzing page...');
      
      // Get all elements that might be photo-related
      const analysis = await page.evaluate(() => {
        const results = {
          fileInputs: [],
          buttons: [],
          photoRelatedElements: [],
          allInputs: []
        };
        
        // Find all file inputs
        const fileInputs = document.querySelectorAll('input[type="file"]');
        fileInputs.forEach((input, i) => {
          results.fileInputs.push({
            index: i,
            id: input.id,
            name: input.name,
            className: input.className,
            accept: input.accept,
            visible: input.offsetParent !== null,
            display: window.getComputedStyle(input).display,
            visibility: window.getComputedStyle(input).visibility
          });
        });
        
        // Find all buttons
        const buttons = document.querySelectorAll('button');
        buttons.forEach((btn, i) => {
          const text = btn.textContent.trim().toLowerCase();
          if (text.includes('foto') || text.includes('photo') || text.includes('bild') || text.includes('image') || text.includes('hochladen') || text.includes('upload')) {
            results.buttons.push({
              index: i,
              text: btn.textContent.trim(),
              id: btn.id,
              className: btn.className,
              dataTestId: btn.getAttribute('data-testid'),
              visible: btn.offsetParent !== null
            });
          }
        });
        
        // Find elements with photo/image related text or attributes
        const allElements = document.querySelectorAll('[class*="photo" i], [class*="image" i], [id*="photo" i], [id*="image" i], [data-testid*="photo" i]');
        allElements.forEach((el, i) => {
          results.photoRelatedElements.push({
            index: i,
            tag: el.tagName,
            id: el.id,
            className: el.className,
            dataTestId: el.getAttribute('data-testid'),
            text: el.textContent.trim().substring(0, 50),
            visible: el.offsetParent !== null
          });
        });
        
        // Get all inputs
        const allInputs = document.querySelectorAll('input');
        results.allInputs = allInputs.length;
        
        return results;
      });
      
      // Only take screenshot if explicitly requested via query parameter
      const includeScreenshot = req.query.screenshot === 'true';
      let screenshot = null;
      
      if (includeScreenshot) {
        logger.info('Taking screenshot (requested via query parameter)');
        screenshot = await playwrightService.takeScreenshot(page);
      } else {
        logger.info('Skipping screenshot (not requested)');
      }
      
      await playwrightService.closeBrowser();
      
      const duration = Date.now() - startTime;
      
      const response = {
        success: true,
        analysis,
        duration,
        message: 'Page analyzed after filling all fields'
      };
      
      // Only include screenshot if it was taken
      if (screenshot) {
        response.screenshot = screenshot;
      }
      
      res.status(200).json(response);
      
    } catch (error) {
      logger.error('Debug analysis failed', { error: error.message });
      
      if (page) {
        await playwrightService.closeBrowser();
      }
      
      res.status(500).json({
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      });
    }
  }
}

module.exports = new DebugPhotoUploadController();
