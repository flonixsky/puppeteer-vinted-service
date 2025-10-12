const { getBrowser } = require('../services/puppeteer');
const { getValidSession } = require('../services/supabase');
const { findBestCategory, navigateToCategory } = require('../utils/categoryMapping');
const logger = require('../utils/logger');

async function testCategorySelection(req, res) {
  const startTime = Date.now();
  let browser = null;
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

    browser = await getBrowser();
    page = await browser.newPage();

    await page.setCookie(...session.cookies);
    await page.setUserAgent(session.user_agent);

    logger.info('🌐 Öffne Vinted...');
    await page.goto('https://www.vinted.de/items/new', {
      waitUntil: 'networkidle0',
      timeout: 30000
    });

    const screenshot1 = await page.screenshot({ encoding: 'base64' });

    // Navigiere
    logger.info('🎯 Starte Navigation...');
    const success = await navigateToCategory(page, vintedCategory);

    if (!success) {
      throw new Error('Navigation fehlgeschlagen');
    }

    await page.waitForTimeout(2000);
    const screenshot2 = await page.screenshot({ encoding: 'base64' });

    // Prüfe Brand-Feld
    const brandFieldVisible = await page.evaluate(() => {
      const brandField = document.querySelector('#brand, [name="brand"]');
      return brandField && brandField.offsetParent !== null;
    });

    const duration = Date.now() - startTime;

    logger.info(`✅ Test erfolgreich in ${duration}ms`);

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
        errorScreenshot = await page.screenshot({ encoding: 'base64' });
      } catch (e) {}
    }

    res.status(500).json({
      success: false,
      error: error.message,
      screenshot: errorScreenshot
    });

  } finally {
    if (page) await page.close();
    if (browser) await browser.close();
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
