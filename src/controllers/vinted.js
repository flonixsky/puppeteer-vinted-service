const vintedService = require('../services/vinted');
const supabaseService = require('../services/supabase');
const logger = require('../utils/logger');

class VintedController {
  async publishArticle(req, res) {
    const startTime = Date.now();
    
    try {
      const { articleId } = req.body;
      
      if (!articleId) {
        return res.status(400).json({
          success: false,
          error: 'articleId is required'
        });
      }
      
      logger.info('Publish request received', { articleId });
      
      const article = await supabaseService.getArticle(articleId);
      
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'Article not found'
        });
      }
      
      const session = await supabaseService.getActiveSession();
      
      if (!session) {
        return res.status(401).json({
          success: false,
          error: 'No active Vinted session found. Please login first.'
        });
      }
      
      logger.info('Publishing to Vinted', {
        articleId,
        title: article.title,
        sessionId: session.id
      });
      
      const publishResult = await vintedService.publishArticle(
        article,
        session.cookies,
        session.user_agent
      );
      
      if (!publishResult.success) {
        await supabaseService.logActivity(
          articleId,
          'vinted_publish',
          'failed',
          { error: publishResult.error },
          publishResult.error,
          publishResult.duration
        );
        
        return res.status(500).json({
          success: false,
          error: publishResult.error,
          duration: publishResult.duration,
          screenshot: publishResult.screenshot
        });
      }
      
      await supabaseService.updateArticleVintedInfo(
        articleId,
        publishResult.vintedUrl,
        publishResult.vintedId
      );
      
      await supabaseService.updateSessionLastUsed(session.id);
      
      await supabaseService.logActivity(
        articleId,
        'vinted_publish',
        'success',
        {
          vintedUrl: publishResult.vintedUrl,
          vintedId: publishResult.vintedId
        },
        null,
        publishResult.duration
      );
      
      const duration = Date.now() - startTime;
      
      logger.info('Publish completed successfully', {
        articleId,
        vintedUrl: publishResult.vintedUrl,
        duration
      });
      
      res.status(200).json({
        success: true,
        message: 'Article published to Vinted successfully',
        vinted: {
          url: publishResult.vintedUrl,
          id: publishResult.vintedId
        },
        duration,
        screenshot: publishResult.screenshot
      });
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Publish endpoint error', {
        error: error.message,
        stack: error.stack,
        duration
      });
      
      res.status(500).json({
        success: false,
        error: 'Internal server error during publish',
        message: error.message,
        duration
      });
    }
  }
}

module.exports = new VintedController();
