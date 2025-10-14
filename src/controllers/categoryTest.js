const playwrightService = require('../services/playwright');
const { getValidSession } = require('../services/supabase');
const { findBestCategory } = require('../utils/categoryMapping');
const vintedService = require('../services/vinted');
const logger = require('../utils/logger');

async function testCategorySelection(req, res) {
  const startTime = Date.now();
  let page = null;

  try {
    const { category, gender } = req.body;

    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'Category is required'
      });
    }

    logger.info(`🧪 Test: Kategorie "${category}"`);

    // Finde Kategorie
    const vintedCategory = findBestCategory(category, gender);
    logger.info(`📂 Gefunden: ${vintedCategory.full_path}`);

    // Hole Session
    const session = await getValidSession();
    if (!session) {
      return res.status(401).json({
        success: false,
        error: 'No valid session. Please login first.'
      });
    }

    page = await playwrightService.createPage(session.user_agent);

    await playwrightService.setCookies(page, session.cookies);

    logger.info('🌐 Öffne Vinted...');
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    const screenshot1 = await playwrightService.takeScreenshot(page);

    // Navigiere mit der neuen Playwright-Methode
    logger.info('🎯 Starte Navigation...');
    const success = await vintedService.navigateToCategoryPlaywright(page, vintedCategory);

    if (!success) {
      throw new Error('Navigation fehlgeschlagen');
    }

    await playwrightService.randomDelay(2000, 3000);
    const screenshot2 = await playwrightService.takeScreenshot(page);

    // Prüfe Brand-Feld
    const brandFieldVisible = await page.evaluate(() => {
      const brandField = document.querySelector('#brand, [name="brand"]');
      return brandField && brandField.offsetParent !== null;
    });

    const duration = Date.now() - startTime;

    logger.info(`✅ Test erfolgreich in ${duration}ms`);

    await playwrightService.closeBrowser();

    res.json({
      success: true,
      result: {
        aiCategory: category,
        aiGender: gender,
        vintedCategory: {
          full_path: vintedCategory.full_path,
          depth: vintedCategory.depth
        },
        brandFieldVisible,
        duration,
        screenshots: {
          before: screenshot1,
          after: screenshot2
        }
      }
    });

  } catch (error) {
    logger.error('❌ Test failed:', error);
    
    let errorScreenshot = null;
    if (page) {
      try {
        errorScreenshot = await playwrightService.takeScreenshot(page);
      } catch (e) {}
    }

    await playwrightService.closeBrowser();

    res.status(500).json({
      success: false,
      error: error.message,
      screenshot: errorScreenshot
    });
  }
}

async function listCategories(req, res) {
  const { VINTED_CATEGORIES } = require('../utils/categoryMapping');
  
  res.json({
    success: true,
    total: VINTED_CATEGORIES.total,
    categories: VINTED_CATEGORIES.categories.map(cat => cat.full_path)
  });
}

module.exports = {
  testCategorySelection,
  listCategories
};
