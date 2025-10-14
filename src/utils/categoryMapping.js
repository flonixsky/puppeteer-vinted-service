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
 * Klickt auf ein Element mit Retry-Logik und mehreren Selektoren
 */
async function clickWithRetry(page, elementText, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`    Versuch ${attempt}/${maxRetries} für "${elementText}"`);
      
      // Warte kurz auf DOM-Update
      await page.waitForTimeout(300);
      
      // Strategy 1: Suche innerhalb des Formulars (am wichtigsten!)
      const clickedInForm = await page.evaluate((text) => {
        const form = document.querySelector('form');
        if (!form) return false;
        
        const allElements = form.querySelectorAll('button, span, div[role="button"], a');
        
        for (const el of allElements) {
          const elText = el.textContent.trim();
          
          // Exakte Übereinstimmung
          if (elText === text) {
            // Prüfe Sichtbarkeit
            const rect = el.getBoundingClientRect();
            const isVisible = el.offsetParent !== null && 
                            rect.width > 0 && 
                            rect.height > 0;
            
            if (isVisible) {
              el.click();
              return true;
            }
          }
        }
        return false;
      }, elementText);
      
      if (clickedInForm) {
        console.log(`    ✓ Gefunden im Formular`);
        await page.waitForTimeout(500);
        return true;
      }
      
      // Strategy 2: XPath (sehr präzise für Text-Matching)
      const xpathSelectors = [
        `//form//button[normalize-space(text())="${elementText}"]`,
        `//form//span[normalize-space(text())="${elementText}"]`,
        `//form//div[@role="button"][normalize-space(text())="${elementText}"]`,
        `//button[normalize-space(text())="${elementText}"]`,
        `//span[normalize-space(text())="${elementText}"]`
      ];
      
      for (const xpath of xpathSelectors) {
        try {
          const elements = await page.$x(xpath);
          
          for (const element of elements) {
            const isVisible = await element.evaluate(el => {
              if (!el.offsetParent) return false;
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            
            if (isVisible) {
              console.log(`    ✓ Gefunden mit XPath`);
              await element.click();
              await page.waitForTimeout(500);
              return true;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      // Strategy 3: Fallback - alle clickable Elements durchsuchen
      const clickedGlobal = await page.evaluate((text) => {
        const clickableSelectors = [
          'button',
          '[role="button"]',
          'span[class*="category"]',
          'div[class*="category"]',
          'a'
        ];
        
        for (const selector of clickableSelectors) {
          const elements = document.querySelectorAll(selector);
          
          for (const el of elements) {
            const elText = el.textContent.trim();
            
            if (elText === text) {
              const rect = el.getBoundingClientRect();
              const isVisible = el.offsetParent !== null && 
                              rect.width > 0 && 
                              rect.height > 0;
              
              if (isVisible) {
                el.click();
                return true;
              }
            }
          }
        }
        return false;
      }, elementText);
      
      if (clickedGlobal) {
        console.log(`    ✓ Gefunden (global)`);
        await page.waitForTimeout(500);
        return true;
      }
      
      // Kein Selector hat funktioniert, warte und retry
      if (attempt < maxRetries) {
        console.log(`    ⏳ Element nicht gefunden, warte ${attempt * 500}ms...`);
        await page.waitForTimeout(attempt * 500);
      }
      
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      console.log(`    ⚠️ Fehler: ${error.message}`);
    }
  }
  
  return false;
}

/**
 * Navigiert durch die Kategorie-Hierarchie
 */
async function navigateToCategory(page, category) {
  console.log(`🎯 Navigiere zu: ${category.full_path}`);
  
  try {
    // Warte auf Upload-Form
    await page.waitForSelector('form', { timeout: 10000 });
    console.log('  ✓ Upload-Formular geladen');
    
    // Hauptkategorie
    if (category.hauptkategorie) {
      const mainCat = category.hauptkategorie;
      console.log(`  1️⃣ Hauptkategorie: ${mainCat}`);
      
      // Spezielle Selektoren für Hauptkategorien
      const clicked = await clickWithRetry(page, mainCat, 3);
      
      if (!clicked) {
        throw new Error(`Hauptkategorie "${mainCat}" nicht gefunden`);
      }
      
      console.log(`    ✅ ${mainCat} ausgewählt`);
      await page.waitForTimeout(800);
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
      
      const clicked = await clickWithRetry(page, subCat, 3);
      
      if (!clicked) {
        console.warn(`  ⚠️ Unterkategorie "${subCat}" nicht gefunden, fahre fort`);
        // Nicht abbrechen, weitermachen mit nächster Ebene
      } else {
        console.log(`    ✅ ${subCat} ausgewählt`);
      }
      
      await page.waitForTimeout(600);
    }

    // Warte auf Brand-API (signalisiert dass Kategorie-Felder geladen sind)
    console.log('  ⏳ Warte auf Brand-API...');
    try {
      await page.waitForResponse(
        response => {
          const url = response.url();
          return url.includes('/item_upload/brands?category_id=') ||
                 url.includes('/categories') ||
                 url.includes('/catalog');
        },
        { timeout: 8000 }
      );
      console.log('  ✅ Kategorie-API geladen!');
    } catch (e) {
      console.warn('  ⚠️ API Timeout (könnte OK sein)');
    }

    // Zusätzlich: Warte auf DOM-Änderungen
    await page.waitForTimeout(1500);
    
    // Verify: Prüfe ob Brand-Feld erschienen ist
    const brandFieldExists = await page.$('input[name="brand"], input[id="brand"]');
    if (brandFieldExists) {
      console.log('  ✅ Brand-Feld ist sichtbar (Kategorie wurde geladen)');
    } else {
      console.warn('  ⚠️ Brand-Feld nicht gefunden, aber fahre fort');
    }

    return true;

  } catch (error) {
    console.error('❌ Kategorie-Navigation fehlgeschlagen:', error.message);
    
    // Screenshot bei Fehler
    try {
      const screenshot = await page.screenshot({ encoding: 'base64' });
      console.error('📸 Screenshot gespeichert (base64)');
    } catch (e) {
      // Ignore screenshot errors
    }
    
    return false;
  }
}

module.exports = {
  VINTED_CATEGORIES,
  findBestCategory,
  navigateToCategory
};
