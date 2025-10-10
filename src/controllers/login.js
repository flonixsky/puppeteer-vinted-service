const vintedService = require('../services/vinted');
const supabaseService = require('../services/supabase');
const logger = require('../utils/logger');

class LoginController {
  async loginToVinted(req, res) {
    const startTime = Date.now();

    try {
      const { email, password } = req.body;
      
      // Validation
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Email and password are required'
        });
      }

      logger.info('Login request received', { email });

      // Perform login
      const loginResult = await vintedService.login(email, password);

      if (!loginResult.success) {
        return res.status(401).json({
          success: false,
          error: loginResult.error,
          duration: loginResult.duration,
          errorScreenshot: loginResult.errorScreenshot
        });
      }

      // Save session to database
      logger.info('Saving session to database...');
      const session = await supabaseService.saveSession(
        email,
        loginResult.cookies,
        loginResult.userAgent
      );

      const duration = Date.now() - startTime;

      logger.info('Login completed successfully', {
        sessionId: session.id,
        duration: duration
      });

      res.status(200).json({
        success: true,
        message: 'Login successful and session saved',
        session: {
          id: session.id,
          email: session.account_email,
          validUntil: session.valid_until,
          cookieCount: loginResult.cookies.length
        },
        duration: duration,
        screenshots: {
          before: loginResult.screenshots.before,
          after: loginResult.screenshots.after
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('Login endpoint error', {
        error: error.message,
        stack: error.stack,
        duration: duration
      });

      res.status(500).json({
        success: false,
        error: 'Internal server error during login',
        message: error.message,
        duration: duration
      });
    }
  }

  async getSessionStatus(req, res) {
    try {
      logger.info('Session status check requested');

      const session = await supabaseService.getActiveSession();

      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'No active session found',
          hasActiveSession: false
        });
      }

      res.status(200).json({
        success: true,
        hasActiveSession: true,
        session: {
          id: session.id,
          email: session.account_email,
          validUntil: session.valid_until,
          lastUsed: session.last_used,
          createdAt: session.created_at
        }
      });

    } catch (error) {
      logger.error('Session status check error', {
        error: error.message
      });
                                          
      res.status(500).json({
        success: false,
        error: 'Failed to check session status',
        message: error.message
      });
    }
  }

  async invalidateSession(req, res) {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: 'Session ID is required'
        });
      }

      logger.info('Invalidating session', { sessionId });

      await supabaseService.invalidateSession(parseInt(sessionId));

      res.status(200).json({
        success: true,
        message: 'Session invalidated successfully'
      });

    } catch (error) {
      logger.error('Session invalidation error', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to invalidate session',
        message: error.message
      });
    }
  }

  async uploadCookies(req, res) {
    try {
      const { cookies, email } = req.body;

      if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Cookies array is required'
        });
      }

      if (!email) {
        return res.status(400).json({
          success: false,
          error: 'Email is required'
        });
      }

      logger.info('Uploading manual cookies', {
        email,
        cookieCount: cookies.length
      });

      // Get user agent from request or use default
      const userAgent = req.headers['user-agent'] ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      // Save to database
      const session = await supabaseService.saveSession(
        email,
        cookies,
        userAgent
      );

      logger.info('Manual cookies saved successfully', {
        sessionId: session.id
      });

      res.status(200).json({
        success: true,
        message: 'Cookies uploaded and session created',
        session: {
          id: session.id,
          email: session.account_email,
          validUntil: session.valid_until,
          cookieCount: cookies.length
        }
      });

    } catch (error) {
      logger.error('Cookie upload error', {
        error: error.message
      });

      res.status(500).json({
        success: false,
        error: 'Failed to upload cookies',
        message: error.message
      });
    }
  }
}

module.exports = new LoginController();
