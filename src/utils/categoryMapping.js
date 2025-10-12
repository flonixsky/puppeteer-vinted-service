// Vinted Kategorie-Mapping mit vollständigen Pfaden
const VINTED_CATEGORIES = require('./vintedCategoriesData.json');

/**
 * Sucht die passende Vinted-Kategorie basierend auf AI-Analyse
 */
function findBestCategory(aiCategory, aiGender = null) {
  if (!aiCategory) {
    console.warn('Keine Kategorie angegeben, nutze Fallback');
    return VINTED_CATEGORIES.categories[0];
  }

  const normalized = aiCategory.toLowerCase();
  const genderMap = {
    'women': 'damen',
    'men': 'herren',
    'kids': 'kinder',
    'female': 'damen',
    'male': 'herren'
  };
  
  const targetGender = aiGender ? genderMap[aiGender.toLowerCase()] : null;

  // Mapping: AI-Begriffe → Vinted-Kategorien
  const categoryKeywords = {
    't-shirt': ['t-shirts', 'tops & t-shirts'],
    'shirt': ['t-shirts', 'tops & t-shirts'],
    'blouse': ['blusen'],
    'top': ['tops & t-shirts'],
    'sweater': ['pullover', 'sweater'],
    'hoodie': ['hoodies', 'pullis & hoodies'],
    'pullover': ['pullover'],
    'jacket': ['jacken'],
    'coat': ['mäntel'],
    'blazer': ['blazer'],
    'jeans': ['jeans'],
    'pants': ['hosen'],
    'trousers': ['hosen'],
    'leggings': ['leggings'],
    'shorts': ['shorts'],
    'dress': ['kleider'],
    'skirt': ['röcke']
  };

  let keywords = [];
  for (const [key, values] of Object.entries(categoryKeywords)) {
    if (normalized.includes(key)) {
      keywords = values;
      break;
    }
  }

  const candidates = VINTED_CATEGORIES.categories.filter(cat => {
    if (targetGender && cat.hauptkategorie.toLowerCase() !== targetGender) {
      return false;
    }
    
    if (keywords.length > 0) {
      const fullPathLower = cat.full_path.toLowerCase();
      return keywords.some(kw => fullPathLower.includes(kw));
    }
    
    return false;
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.depth - a.depth);
    console.log(`✅ Kategorie gefunden: ${candidates[0].full_path}`);
    return candidates[0];
  }

  const fallback = VINTED_CATEGORIES.categories.find(
    cat => cat.full_path === "Damen → Kleidung → Sonstiges"
  );
  
  console.warn(`⚠️ Keine passende Kategorie für "${aiCategory}"`);
  return fallback || VINTED_CATEGORIES.categories[0];
}

/**
 * Navigiert durch die Kategorie-Hierarchie
 */
async function navigateToCategory(page, category) {
  console.log(`🎯 Navigiere zu: ${category.full_path}`);
  
  try {
    // Hauptkategorie
    if (category.hauptkategorie) {
      const mainCat = category.hauptkategorie;
      console.log(`  1️⃣ Hauptkategorie: ${mainCat}`);
      
      const clicked = await page.evaluate((text) => {
        const spans = Array.from(document.querySelectorAll('[data-testid*="first-category-"]'));
        const match = spans.find(s => s.textContent.trim() === text);
        if (match) {
          match.click();
          return true;
        }
        return false;
      }, mainCat);
      
      if (!clicked) {
        throw new Error(`Hauptkategorie "${mainCat}" nicht gefunden`);
      }
      
      await page.waitForTimeout(1000);
    }

    // Unterkategorien
    const subCategories = [
      category.kategorie1,
      category.kategorie2, 
      category.kategorie3,
      category.kategorie4
    ].filter(Boolean);

    for (let i = 0; i < subCategories.length; i++) {
      const subCat = subCategories[i];
      console.log(`  ${i + 2}️⃣ Unterkategorie: ${subCat}`);
      
      await page.waitForTimeout(500);
      
      const clicked = await page.evaluate((text) => {
        const allElements = Array.from(document.querySelectorAll('*'));
        const match = allElements.find(el => {
          const elText = el.textContent.trim();
          return elText === text && el.offsetParent !== null;
        });
        
        if (match) {
          match.click();
          return true;
        }
        return false;
      }, subCat);
      
      if (!clicked) {
        console.warn(`⚠️ Unterkategorie "${subCat}" nicht gefunden`);
      }
      
      await page.waitForTimeout(800);
    }

    // Warte auf Brand-API
    console.log('  ⏳ Warte auf Brand-API...');
    try {
      await page.waitForResponse(
        response => response.url().includes('/item_upload/brands?category_id='),
        { timeout: 5000 }
      );
      console.log('  ✅ Brand-API geladen!');
    } catch (e) {
      console.warn('  ⚠️ Brand-API Timeout');
    }

    await page.waitForTimeout(1000);
    return true;

  } catch (error) {
    console.error('❌ Kategorie-Navigation fehlgeschlagen:', error.message);
    return false;
  }
}

module.exports = {
  VINTED_CATEGORIES,
  findBestCategory,
  navigateToCategory
};
