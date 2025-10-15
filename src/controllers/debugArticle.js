const supabaseService = require('../services/supabase');
const logger = require('../utils/logger');

class DebugArticleController {
  async getArticleData(req, res) {
    try {
      const { articleId } = req.params;
      
      if (!articleId) {
        return res.status(400).json({
          success: false,
          error: 'articleId is required'
        });
      }
      
      logger.info('Debug: Getting article data', { articleId });
      
      const article = await supabaseService.getArticle(articleId);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }
      
      // Return full article data for debugging
      res.status(200).json({
        success: true,
        article: article,
        imageAnalysis: {
          hasOriginalImage: !!article.original_image_url,
          hasProcessedImage: !!article.processed_image_url,
          hasImageUrls: !!article.image_urls,
          imageUrlsCount: article.image_urls ? article.image_urls.length : 0,
          imageUrls: article.image_urls || []
        }
      });
      
    } catch (error) {
      logger.error('Debug article endpoint error', {
        error: error.message,
        stack: error.stack
      });
      
      res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }
}

module.exports = new DebugArticleController();
