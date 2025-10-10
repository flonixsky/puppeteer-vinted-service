const logger = require('../utils/logger');

class HealthController {
  async checkHealth(req, res) {
    try {
      const uptime = process.uptime();
      const memory = process.memoryUsage();

      const healthData = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(uptime),
        memory: {
          rss: `${Math.round(memory.rss / 1024 / 1024)}MB`,
          heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
          heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`
        },
        environment: process.env.NODE_ENV || 'development'
      };

      logger.info('Health check requested', { uptime: healthData.uptime });
      
      res.status(200).json(healthData);
    } catch (error) {
      logger.error('Health check failed', { error: error.message });
      res.status(500).json({
        status: 'error',
        message: error.message
      });
    }
  }

  async checkReadiness(req, res) {
    try {
      // Hier können wir später prüfen ob Puppeteer bereit ist
      // und ob Supabase Connection steht
      res.status(200).json({
        status: 'ready',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        message: error.message
      });
    }
  }
}

module.exports = new HealthController();
