const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

class SupabaseService {
  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    }

    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    logger.info('Supabase service initialized');
  }

  // ========================================
  // SESSION MANAGEMENT
  // ========================================

  async saveSession(email, cookies, userAgent) {
    try {
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 7); // 7 Tage gültig

      const { data, error } = await this.supabase
        .from('vinted_sessions')
        .insert({
          account_email: email,
          cookies: cookies,
          user_agent: userAgent,
          session_valid: true,
          valid_until: validUntil.toISOString(),
          last_used: new Date().toISOString(),
          login_attempts: 0
        })
        .select()
        .single();

      if (error) {
        logger.error('Failed to save session', { error: error.message });
        throw error;
      }

      logger.info('Session saved successfully', { 
        sessionId: data.id,
        email: email,
        validUntil: validUntil.toISOString()
      });

      return data;
    } catch (error) {
      logger.error('Error in saveSession', { error: error.message });
      throw error;
    }
  }

  async getActiveSession() {
    try {
      const { data, error } = await this.supabase
        .from('vinted_sessions')
        .select('*')
        .eq('session_valid', true)
        .gt('valid_until', new Date().toISOString())
        .order('last_used', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        logger.error('Failed to get active session', { error: error.message });
        throw error;
      }

      if (!data) {
        logger.info('No active session found');
        return null;
      }

      logger.info('Active session found', { 
        sessionId: data.id,
        email: data.account_email,
        lastUsed: data.last_used
      });

      return data;
    } catch (error) {
      logger.error('Error in getActiveSession', { error: error.message });
      throw error;
    }
  }

  async updateSessionLastUsed(sessionId) {
    try {
      const { error } = await this.supabase
        .from('vinted_sessions')
        .update({ 
          last_used: new Date().toISOString() 
        })
        .eq('id', sessionId);

      if (error) {
        logger.error('Failed to update session', { error: error.message });
        throw error;
      }

      logger.info('Session last_used updated', { sessionId });
    } catch (error) {
      logger.error('Error in updateSessionLastUsed', { error: error.message });
      throw error;
    }
  }

  async invalidateSession(sessionId) {
    try {
      const { error } = await this.supabase
        .from('vinted_sessions')
        .update({ session_valid: false })
        .eq('id', sessionId);

      if (error) {
        logger.error('Failed to invalidate session', { error: error.message });
        throw error;
      }

      logger.info('Session invalidated', { sessionId });
    } catch (error) {
      logger.error('Error in invalidateSession', { error: error.message });
      throw error;
    }
  }

  // ========================================
  // ARTICLE MANAGEMENT
  // ========================================

  async getArticle(articleId) {
    try {
      const { data, error } = await this.supabase
        .from('articles')
        .select('*')
        .eq('id', articleId)
        .single();

      if (error) {
        logger.error('Failed to get article', { 
          articleId,
          error: error.message 
        });
        throw error;
      }

      logger.info('Article retrieved', { articleId, title: data.title });
      return data;
    } catch (error) {
      logger.error('Error in getArticle', { error: error.message });
      throw error;
    }
  }

  async updateArticleVintedInfo(articleId, vintedUrl, vintedId) {
    try {
      const { data, error } = await this.supabase
        .from('articles')
        .update({
          vinted_url: vintedUrl,
          vinted_id: vintedId,
          status: 'published',
          vinted_published_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', articleId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update article', { 
          articleId,
          error: error.message 
        });
        throw error;
      }

      logger.info('Article updated with Vinted info', { 
        articleId,
        vintedUrl,
        vintedId
      });

      return data;
    } catch (error) {
      logger.error('Error in updateArticleVintedInfo', { error: error.message });
      throw error;
    }
  }

  // ========================================
  // ACTIVITY LOG
  // ========================================

  async logActivity(articleId, action, status, details = {}, errorMessage = null, duration = null) {
    try {
      const { error } = await this.supabase
        .from('activity_log')
        .insert({
          article_id: articleId,
          action: action,
          status: status,
          details: details,
          error_message: errorMessage,
          duration_ms: duration,
          created_at: new Date().toISOString()
        });

      if (error) {
        logger.error('Failed to log activity', { error: error.message });
        // Don't throw - logging shouldn't break the main flow
      } else {
        logger.info('Activity logged', { articleId, action, status });
      }
    } catch (error) {
      logger.error('Error in logActivity', { error: error.message });
      // Don't throw
    }
  }
}

module.exports = new SupabaseService();
