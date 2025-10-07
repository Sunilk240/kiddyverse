# KiddyVerse Deployment Guide

## Frontend Deployment (Render/Vercel/Netlify)

### Build Settings:
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **Node Version**: 18+

### Environment Variables:
```
VITE_API_BASE_URL=https://your-backend-url.com
```

## Backend Deployment (Render/Railway/Heroku)

### Python Backend Settings:
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `python main.py`
- **Python Version**: 3.9+

### Required Environment Variables:
```
PORT=8080
# CORS Configuration - Comma-separated list of allowed origins
ALLOWED_ORIGIN=https://your-frontend-url.com,http://localhost:5173
RATE_LIMIT_RPM=60

# Dual Gemini API Keys
GEMINI_API_KEY_1=your_primary_api_key
GEMINI_API_KEY_2=your_backup_api_key

# Model Configuration
MODEL_OCR=gemini-2.5-flash
MODEL_SUMMARIZE=gemini-2.5-flash
MODEL_TRANSLATE=gemini-2.5-flash
MODEL_QA=gemini-2.5-flash

# File Processing Limits
MAX_IMAGES=5
MAX_PDF_PAGES=5
MAX_FILE_SIZE_MB=10
```

### Dependencies (requirements.txt):
```
fastapi==0.104.1
uvicorn[standard]==0.24.0
python-multipart==0.0.6
python-dotenv==1.0.0
google-genai>=0.8.0
pillow>=10.0.0
PyPDF2>=3.0.1
slowapi>=0.1.9
pydantic>=2.0.0
```

## Quick Deploy Commands:

### Frontend:
```bash
cd frontend
npm install
npm run build
# Deploy dist/ folder
```

### Backend:
```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on port 8080
```

## Health Check Endpoints:
- Frontend: `https://your-app.com`
- Backend: `https://your-api.com/health`

## Features:
✅ Dual API key failover system
✅ Smart OCR (Tesseract.js + Gemini)
✅ Student-friendly UI
✅ Mobile-first responsive design
✅ Offline OCR capability
✅ Rate limiting protection