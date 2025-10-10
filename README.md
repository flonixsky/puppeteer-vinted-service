# Puppeteer Vinted Service

Microservice für automatisches Publizieren von Second-Hand Kleidung auf Vinted.

## Features

- ✅ Automatisches Login mit Cookie-Management
- ✅ Artikel-Upload mit Puppeteer
- ✅ Human-in-the-Loop bei Captchas
- ✅ Screenshot-System bei Errors
- ✅ Health Checks & Monitoring
- ✅ Graceful Shutdown

## API Endpoints

### Health Check
```bash
GET /health
```

### Readiness Check
```bash
GET /ready
```

### Login (Coming Soon)
```bash
POST /login
Content-Type: application/json

{
  "email": "your@email.com",
  "password": "yourpassword"
}
```

### Publish Article (Coming Soon)
```bash
POST /publish
Content-Type: application/json

{
  "articleId": 1,
  "title": "Nike Hoodie XL",
  "description": "...",
  "category": "Hoodie",
  "brand": "Nike",
  "size": "XL",
  "color": "Schwarz",
  "condition": "good",
  "price": 25.00,
  "imageUrl": "https://..."
}
```

## Local Development

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Start development server
npm run dev
```

## Docker Deployment

```bash
# Build image
docker build -t puppeteer-vinted-service .

# Run container
docker run -p 3001:3001 --env-file .env puppeteer-vinted-service
```

## Environment Variables

See `.env.example` for all required environment variables.

## Coolify Deployment

1. Create new service in Coolify
2. Select "Docker Image" type
3. Point to this repository
4. Add environment variables
5. Deploy

## Architecture

```
Frontend → n8n → Puppeteer Service → Vinted
                      ↓
                  Supabase
```

## License

MIT
