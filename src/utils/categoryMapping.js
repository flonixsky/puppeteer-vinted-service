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
  
  // Default zu Damen wenn kein Gender angegeben
  const targetGender = aiGender ? genderMap[aiGender.toLowerCase()] : 'damen';

  // Mapping: AI-Begriffe → Vinted-Kategorien (exakte Priorität)
  const categoryKeywords = {
    't-shirt': 't-shirts',
    'shirt': 'shirts',
    'blouse': 'blusen',
    'top': 'tops',
    'sweater': 'sweater',
    'hoodie': 'hoodies',
    'pullover': 'pullover',
    'jacket': 'jacken',
    'coat': 'mäntel',
    'blazer': 'blazer',
    'jeans': 'jeans',
    'pants': 'hosen',
    'trousers': 'hosen',
    'leggings': 'leggings',
    'shorts': 'shorts',
    'dress': 'kleider',
    'skirt': 'röcke'
  };

  // Finde passende Kategorien
  const candidates = VINTED_CATEGORIES.categories.filter(cat => {
    // Filtere nach Gender
    if (cat.hauptkategorie.toLowerCase() !== targetGender) {
      return false;
    }
    
    // Suche nach Keyword-Match
    const fullPathLower = cat.full_path.toLowerCase();
    for (const [keyword, vintedTerm] of Object.entries(categoryKeywords)) {
      if (normalized.includes(keyword)) {
        return fullPathLower.includes(vintedTerm);
      }
    }
    
    return false;
  });

  if (candidates.length === 0) {
    console.warn(`⚠️ Keine passende Kategorie für "${aiCategory}" (${targetGender})`);
    const fallback = VINTED_CATEGORIES.categories.find(
      cat => cat.full_path === "Damen → Kleidung → Sonstiges"
    );
    return fallback || VINTED_CATEGORIES.categories[0];
  }

  // Scoring-System für beste Kategorie
  const scored = candidates.map(cat => {
    let score = 0;
    const pathLower = cat.full_path.toLowerCase();
    const parts = cat.parts.map(p => p.toLowerCase());
    
    // +100 für exakte Übereinstimmung im letzten Teil
    if (parts[parts.length - 1] === normalized) {
      score += 100;
    }
    
    // +50 für exakte Übereinstimmung in irgendeinem Teil
    if (parts.some(p => p === normalized)) {
      score += 50;
    }
    
    // +30 für Keyword-Match im letzten Teil
    for (const [keyword, vintedTerm] of Object.entries(categoryKeywords)) {
      if (normalized.includes(keyword)) {
        const lastPart = parts[parts.length - 1];
        if (lastPart === vintedTerm) {
          score += 30;
        }
      }
    }
    
    // +10 für niedrigere Depth (spezifischer ist besser, aber nicht zu tief)
    // Optimal: depth 3-4
    if (cat.depth === 3 || cat.depth === 4) {
      score += 10;
    }
    
    // -5 für zu tiefe Hierarchie (zu spezifisch)
    if (cat.depth > 4) {
      score -= 5;
    }
    
    return { cat, score };
  });
  
  // Sortiere nach Score (höchster zuerst)
  scored.sort((a, b) => b.score - a.score);
  
  const best = scored[0].cat;
  console.log(`✅ Kategorie gefunden: ${best.full_path} (Score: ${scored[0].score}, Depth: ${best.depth})`);
  
  // Debug: Zeige Top 3
  if (scored.length > 1) {
    console.log(`   Alternative Kategorien:`);
    scored.slice(1, 3).forEach((s, i) => {
      console.log(`   ${i + 2}. ${s.cat.full_path} (Score: ${s.score})`);
    });
  }
  
  return best;
}

/**
 * Klickt auf ein Element mit Retry-Logik und mehreren Selektoren
 */
async function clickWithRetry(page, elementText, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`    Versuch ${attempt}/${maxRetries} für "${elementText}"`);
      
      // Warte kurz auf DOM-Update
      await new Promise(resolve => setTimeout(resolve, 300));
      
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
        await new Promise(resolve => setTimeout(resolve, 500));
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
              await new Promise(resolve => setTimeout(resolve, 500));
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
        await new Promise(resolve => setTimeout(resolve, 500));
        return true;
      }
      
      // Kein Selector hat funktioniert, warte und retry
      if (attempt < maxRetries) {
        console.log(`    ⏳ Element nicht gefunden, warte ${attempt * 500}ms...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
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
    
    // DEBUG: Zeige alle clickable Elemente im Formular
    const debugElements = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return { error: 'No form found' };
      
      const clickable = form.querySelectorAll('button, span, div[role="button"], a');
      const texts = Array.from(clickable)
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0 && t.length < 50) // Filter sinnvolle Texte
        .slice(0, 30); // Max 30
      
      return {
        total: clickable.length,
        texts: [...new Set(texts)] // Unique values
      };
    });
    console.log('  📋 Debug - Clickable elements im Form:', JSON.stringify(debugElements, null, 2));
    
    // WICHTIG: Kategorie-Feld finden und fokussieren
    console.log('  🔍 Suche Kategorie-Feld...');
    const categoryFieldInfo = await page.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) return { found: false, error: 'No form' };
      
      // Suche nach Input/Select Feldern mit category/catalog im Namen
      const inputs = form.querySelectorAll('input, select, [role="combobox"]');
      
      for (const input of inputs) {
        const id = input.id || '';
        const name = input.name || '';
        const placeholder = input.placeholder || '';
        const ariaLabel = input.getAttribute('aria-label') || '';
        
        // Prüfe auf category/catalog/katalog im Namen
        const searchTerms = [id, name, placeholder, ariaLabel].join(' ').toLowerCase();
        if (searchTerms.includes('catalog') || 
            searchTerms.includes('category') || 
            searchTerms.includes('kategor')) {
          
          // Fokussiere und klicke das Feld
          input.focus();
          input.click();
          
          return {
            found: true,
            type: input.tagName,
            id: input.id,
            name: input.name,
            placeholder: input.placeholder
          };
        }
      }
      
      return { found: false, message: 'Kein Kategorie-Feld gefunden' };
    });
    
    console.log('  📝 Kategorie-Feld:', JSON.stringify(categoryFieldInfo, null, 2));
    
    if (categoryFieldInfo.found) {
      console.log('  ✅ Kategorie-Feld gefunden, warte auf Dropdown...');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // DEBUG: Zeige was jetzt sichtbar ist (inkl. Modals/Overlays)
      const debugAfter = await page.evaluate(() => {
        // Suche auch außerhalb des Forms (z.B. Modals)
        const allClickable = document.querySelectorAll('button, span, div[role="button"], a, [role="option"]');
        const texts = Array.from(allClickable)
          .map(el => el.textContent.trim())
          .filter(t => t.length > 0 && t.length < 50)
          .slice(0, 50); // Mehr Elemente zeigen
        return { 
          total: allClickable.length, 
          texts: [...new Set(texts)] 
        };
      });
      console.log('  📋 Nach Feld-Focus (inkl. Modals):', JSON.stringify(debugAfter, null, 2));
    } else {
      console.warn('  ⚠️ Kein Kategorie-Feld gefunden');
    }
    
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
      await new Promise(resolve => setTimeout(resolve, 800));
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
      
      await new Promise(resolve => setTimeout(resolve, 600));
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
    await new Promise(resolve => setTimeout(resolve, 1500));
    
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
