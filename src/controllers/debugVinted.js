const vintedService = require('../services/vinted');
const puppeteerService = require('../services/puppeteer');
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
      page = await puppeteerService.createPage(session.user_agent);
      
      // Go to homepage first
      await page.goto('https://www.vinted.de', { waitUntil: 'networkidle2', timeout: 30000 });
      await puppeteerService.setCookies(page, session.cookies);
      await page.reload({ waitUntil: 'networkidle2' });
      
      // Go to upload page
      await page.goto('https://www.vinted.de/items/new', { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Analyze form structure
      const formAnalysis = await page.evaluate(() => {
        const form = document.querySelector('form');
        if (!form) return { error: 'No form found' };
        
        // Get all inputs
        const inputs = Array.from(form.querySelectorAll('input, select, textarea, [role="combobox"]'));
        const inputInfo = inputs.map(input => ({
          tag: input.tagName,
          type: input.type || '',
          id: input.id || '',
          name: input.name || '',
          placeholder: input.placeholder || '',
          ariaLabel: input.getAttribute('aria-label') || '',
          className: input.className || '',
          value: input.value || '',
          role: input.getAttribute('role') || ''
        }));
        
        // Get all buttons
        const buttons = Array.from(form.querySelectorAll('button, [role="button"]'));
        const buttonInfo = buttons.map(btn => ({
          text: btn.textContent.trim(),
          className: btn.className || '',
          id: btn.id || '',
          type: btn.type || '',
          role: btn.getAttribute('role') || ''
        }));
        
        return {
          inputs: inputInfo,
          buttons: buttonInfo,
          formHTML: form.innerHTML.substring(0, 5000) // First 5000 chars
        };
      });
      
      // Take screenshot
      const screenshot = await puppeteerService.takeScreenshot(page);
      
      await puppeteerService.closeBrowser();
      
      res.status(200).json({
        success: true,
        analysis: formAnalysis,
        screenshot: screenshot
      });
      
    } catch (error) {
      logger.error('Form inspection failed', { error: error.message });
      
      if (page) {
        const errorScreenshot = await puppeteerService.takeScreenshot(page);
        await puppeteerService.closeBrowser();
        
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
