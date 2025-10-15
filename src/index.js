require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const logger = require('./utils/logger');
const healthController = require('./controllers/health');
const loginController = require('./controllers/login');
const categoryTestController = require('./controllers/categoryTest');
const debugVintedController = require('./controllers/debugVinted');
const debugPhotoUploadController = require('./controllers/debugPhotoUpload');
const debugArticleController = require('./controllers/debugArticle');
const vintedController = require('./controllers/vinted');
const app = express();
const PORT = process.env.PORT || 3001;


app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

app.get('/health', healthController.checkHealth);
app.get('/ready', healthController.checkReadiness);
app.post('/cookies/upload', loginController.uploadCookies);
app.post('/login', loginController.loginToVinted);
app.get('/session/status', loginController.getSessionStatus);
app.delete('/session/:sessionId', loginController.invalidateSession);
app.post('/vinted/publish', vintedController.publishArticle);
app.post('/test/category', categoryTestController.testCategorySelection);
app.get('/test/categories', categoryTestController.listCategories);
app.get('/debug/upload-form', debugVintedController.inspectUploadForm.bind(debugVintedController));
app.post('/debug/category-click', debugVintedController.testCategoryClick.bind(debugVintedController));
app.post('/debug/photo-upload', debugPhotoUploadController.analyzeUploadPage.bind(debugPhotoUploadController));
app.get('/debug/article/:articleId', debugArticleController.getArticleData.bind(debugArticleController));

app.get('/', (req, res) => {
  res.json({
    service: 'Puppeteer Vinted Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      readiness: '/ready',
      login: 'POST /login',
      cookiesUpload: 'POST /cookies/upload',
      vintedPublish: 'POST /vinted/publish'
    }
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'Something went wrong'
      : err.message
  });
});

const server = app.listen(PORT, () => {
  logger.info(`🚀 Puppeteer Vinted Service started on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received: closing HTTP server');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app;
