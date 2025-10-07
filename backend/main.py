"""
KiddyVerse - Where Learning Meets Magic
FastAPI backend with dual API key support and mobile-first design.
"""

import os
import logging
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from api_manager import api_manager
from file_processor import file_processor, FileProcessingResult
from ocr_pipeline import ocr_pipeline, OCRPipelineResult
from session_storage import session_storage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="KiddyVerse Backend",
    description="Where Learning Meets Magic - AI-powered educational assistant for students",
    version="2.0.0"
)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
allowed_origins = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins if allowed_origins != [""] else ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Pydantic models for V2.0
class StudentFriendlyResponse(BaseModel):
    """Standard response format for student-friendly messages."""
    success: bool
    message: str
    data: Optional[dict] = None
    suggestions: Optional[List[str]] = None

class OCRRequest(BaseModel):
    """Request model for OCR processing."""
    session_id: str
    is_handwritten: bool = False

class SummarizeRequest(BaseModel):
    """Request model for text summarization."""
    text: str
    classLevel: str = "7"  # Grade level for age-appropriate summaries

class TranslateRequest(BaseModel):
    """Request model for text translation."""
    text: str
    targetLang: str

class QARequest(BaseModel):
    """Request model for question answering."""
    text: str
    question: str

class HealthResponse(BaseModel):
    """Health check response with API status."""
    ok: bool
    version: str = "2.0.0"
    api_status: dict

# Middleware to handle double slashes and normalize URLs
@app.middleware("http")
async def normalize_path_middleware(request: Request, call_next):
    """Normalize URLs by removing double slashes and handling common issues."""
    # Fix double slashes in path
    if "//" in request.url.path and request.url.path != "/":
        normalized_path = request.url.path.replace("//", "/")
        # Reconstruct URL with normalized path
        normalized_url = request.url.replace(path=normalized_path)
        return JSONResponse(
            status_code=400,
            content={
                "error": "Invalid URL format",
                "message": f"Double slashes detected. Try: {normalized_path}",
                "correct_url": str(normalized_url).replace(str(request.url), str(normalized_url))
            }
        )
    
    response = await call_next(request)
    return response

# Routes
@app.get("/")
@app.head("/")
async def root():
    """Root endpoint - Welcome message for KiddyVerse API."""
    return {
        "message": "🚀 Welcome to KiddyVerse API - Where Learning Meets Magic! ✨",
        "version": "2.0.3",
        "status": "running",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "upload": "/upload-files",
            "extract": "/extract-text", 
            "summarize": "/summarize",
            "translate": "/translate",
            "qa": "/qa"
        }
    }

@app.get("/health", response_model=HealthResponse)
@app.head("/health", response_model=HealthResponse)
@app.get("/v1/health", response_model=HealthResponse)
@app.get("/v2/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint with API key status."""
    api_status = api_manager.get_status()
    
    return HealthResponse(
        ok=api_status["healthy"],
        api_status=api_status
    )

@app.get("/api-status")
@limiter.limit(f"{os.getenv('RATE_LIMIT_RPM', '60')}/minute")
async def get_api_status(request: Request):
    """Get detailed API manager status for monitoring."""
    return api_manager.get_status()

@app.post("/test-api")
@limiter.limit("10/minute")  # Lower limit for testing
async def test_api_keys(request: Request):
    """Test both API keys to verify they're working."""
    try:
        # Test with a simple prompt
        response = await api_manager.generate_content(
            model=os.getenv("MODEL_SUMMARIZE", "gemini-2.5-flash"),
            contents="Say 'Hello from KiddyVerse - Where Learning Meets Magic!' in a friendly way for students."
        )
        
        return StudentFriendlyResponse(
            success=True,
            message="🎉 Great! The AI is ready to help with your homework!",
            data={
                "test_response": response.text if hasattr(response, 'text') else str(response),
                "api_status": api_manager.get_status()
            },
            suggestions=["You can now upload your images or PDFs to get started!"]
        )
        
    except Exception as e:
        logger.error(f"API test failed: {e}")
        return StudentFriendlyResponse(
            success=False,
            message="😔 Oops! I'm having trouble connecting right now.",
            suggestions=[
                "Please try again in a few minutes",
                "Make sure you have a good internet connection",
                "Ask your teacher or parent for help if this keeps happening"
            ]
        )

@app.post("/upload-files", response_model=FileProcessingResult)
@limiter.limit(f"{os.getenv('RATE_LIMIT_RPM', '60')}/minute")
async def upload_files(request: Request, files: List[UploadFile] = File(...)):
    """Upload and validate files with student-friendly error handling."""
    logger.info(f"📁 Processing {len(files)} uploaded file(s)")
    
    try:
        result = await file_processor.validate_and_process_files(files)
        
        if result.success:
            logger.info(f"✅ Successfully processed {len(result.processed_files)} files with {result.total_images} images")
        else:
            logger.warning(f"❌ File processing failed: {result.message}")
        
        return result
        
    except Exception as e:
        logger.error(f"Unexpected error in file upload: {e}")
        return FileProcessingResult(
            success=False,
            message="😔 Something unexpected happened while processing your files.",
            suggestions=[
                "Please try uploading your files again",
                "Make sure your files are not corrupted",
                "Ask for help if this problem continues"
            ],
            error_details=str(e)
        )

@app.get("/file-limits")
async def get_file_limits():
    """Get current file processing limits for the frontend."""
    return {
        "max_images": int(os.getenv("MAX_IMAGES", "5")),
        "max_pdf_pages": int(os.getenv("MAX_PDF_PAGES", "5")),
        "max_file_size_mb": int(os.getenv("MAX_FILE_SIZE_MB", "10")),
        "supported_image_types": ["JPG", "PNG", "GIF", "BMP", "WEBP", "TIFF"],
        "supported_document_types": ["PDF"],
        "student_message": "📚 I can read up to 5 images or PDF pages at a time to help with your homework!"
    }

@app.post("/extract-text", response_model=OCRPipelineResult)
@limiter.limit(f"{os.getenv('RATE_LIMIT_RPM', '60')}/minute")
async def extract_text(request: Request, ocr_request: OCRRequest):
    """Extract text from uploaded files using sequential OCR processing."""
    logger.info(f"🔍 Starting OCR for session: {ocr_request.session_id}")
    
    try:
        # Check if session exists
        session_info = session_storage.get_session_info(ocr_request.session_id)
        if not session_info.get("exists"):
            return OCRPipelineResult(
                success=False,
                message="😔 I can't find your uploaded files. Please upload them again.",
                session_id=ocr_request.session_id,
                total_files_processed=0,
                combined_text="",
                suggestions=[
                    "Make sure you upload files first",
                    "Check that you're using the correct session",
                    "Try refreshing the page and uploading again"
                ],
                error_details="Session not found"
            )
        
        # Process with OCR pipeline
        result = await ocr_pipeline.process_session(
            session_id=ocr_request.session_id,
            is_handwritten=ocr_request.is_handwritten
        )
        
        if result.success:
            logger.info(f"✅ OCR completed for session {ocr_request.session_id}: {len(result.combined_text)} characters extracted")
        else:
            logger.warning(f"❌ OCR failed for session {ocr_request.session_id}: {result.message}")
        
        return result
        
    except Exception as e:
        logger.error(f"Unexpected error in OCR processing: {e}")
        return OCRPipelineResult(
            success=False,
            message="😔 Something unexpected happened while reading your content.",
            session_id=ocr_request.session_id,
            total_files_processed=0,
            combined_text="",
            suggestions=[
                "Please try again in a few moments",
                "Make sure your images are clear and readable",
                "Ask for help if this problem continues"
            ],
            error_details=str(e)
        )

@app.get("/session/{session_id}")
async def get_session_info(session_id: str):
    """Get information about a session."""
    session_info = session_storage.get_session_info(session_id)
    return {
        "session_id": session_id,
        **session_info
    }

@app.get("/storage-stats")
@limiter.limit("10/minute")
async def get_storage_stats(request: Request):
    """Get storage statistics for monitoring."""
    return session_storage.get_storage_stats()

@app.options("/{path:path}")
async def options_handler(path: str):
    """Handle OPTIONS requests for CORS preflight."""
    return JSONResponse(
        content={"message": "CORS preflight successful"},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        }
    )

@app.get("/ocr-methods")
async def get_ocr_methods():
    """Get information about available OCR methods for the frontend."""
    try:
        import pytesseract
        tesseract_available = True
        try:
            tesseract_version = str(pytesseract.get_tesseract_version())
        except:
            tesseract_available = False
            tesseract_version = "Not installed"
    except ImportError:
        tesseract_available = False
        tesseract_version = "Library not available"
    
    return {
        "tesseract": {
            "available": tesseract_available,
            "version": tesseract_version,
            "description": "Fast OCR for printed text (saves API tokens)",
            "best_for": ["Printed textbooks", "Typed documents", "Clear computer-generated text"]
        },
        "gemini": {
            "available": bool(api_manager.current_client),
            "model": os.getenv("MODEL_OCR", "gemini-2.5-flash"),
            "description": "AI-powered OCR for all text types",
            "best_for": ["Handwritten notes", "Complex layouts", "Poor quality images", "Mixed content"]
        },
        "recommendation": {
            "printed_text": "Uncheck 'Is this handwritten?' to use Tesseract first (faster, saves tokens)",
            "handwritten_text": "Check 'Is this handwritten?' to use Gemini directly (better accuracy)",
            "unsure": "Leave unchecked - system will automatically use the best method"
        },
        "student_guidance": {
            "title": "📝 Is your content handwritten?",
            "description": "Help me choose the best way to read your content!",
            "examples": {
                "handwritten": ["Your own notes", "Homework written by hand", "Diary entries"],
                "printed": ["Textbook pages", "Worksheets", "Computer printouts"]
            }
        }
    }

@app.post("/summarize")
@limiter.limit(f"{os.getenv('RATE_LIMIT_RPM', '60')}/minute")
async def summarize_text(request: Request, summarize_request: SummarizeRequest):
    """Create grade-level appropriate summaries of extracted text."""
    logger.info(f"📝 Creating summary for grade {summarize_request.classLevel}")
    
    try:
        if not summarize_request.text.strip():
            return StudentFriendlyResponse(
                success=False,
                message="😔 I don't see any text to summarize!",
                suggestions=[
                    "Make sure you've extracted text from your images first",
                    "Check that your images contain readable text",
                    "Try uploading clearer images if needed"
                ]
            )
        
        # Create grade-appropriate prompt
        grade_level = summarize_request.classLevel
        prompt = f"""
        Please create a summary of the following text that is appropriate for a grade {grade_level} student (age {int(grade_level) + 5}-{int(grade_level) + 6}).

        Guidelines:
        - Use simple, clear language appropriate for the grade level
        - Keep sentences short and easy to understand
        - Focus on the main ideas and key points
        - Make it engaging and helpful for homework
        - Use encouraging, positive tone
        - Aim for 3-5 key points maximum

        Text to summarize:
        {summarize_request.text}

        Please provide a clear, student-friendly summary:
        """
        
        # Generate summary using Gemini
        response = await api_manager.generate_content(
            model=os.getenv("MODEL_SUMMARIZE", "gemini-2.5-flash"),
            contents=prompt
        )
        
        summary_text = response.text if hasattr(response, 'text') else str(response)
        
        logger.info(f"✅ Summary created: {len(summary_text)} characters")
        
        return {
            "success": True,
            "summary": summary_text.strip(),
            "grade_level": grade_level,
            "original_length": len(summarize_request.text),
            "summary_length": len(summary_text)
        }
        
    except Exception as e:
        logger.error(f"❌ Summary generation failed: {e}")
        return StudentFriendlyResponse(
            success=False,
            message="😔 I had trouble creating a summary right now.",
            suggestions=[
                "Please try again in a moment",
                "Make sure your internet connection is working",
                "The text might be too long - try with shorter content"
            ]
        )

@app.post("/translate")
@limiter.limit(f"{os.getenv('RATE_LIMIT_RPM', '60')}/minute")
async def translate_text(request: Request, translate_request: TranslateRequest):
    """Translate extracted text to the target language."""
    logger.info(f"🌍 Translating text to {translate_request.targetLang}")
    
    try:
        if not translate_request.text.strip():
            return StudentFriendlyResponse(
                success=False,
                message="😔 I don't see any text to translate!",
                suggestions=[
                    "Make sure you've extracted text from your images first",
                    "Check that your images contain readable text",
                    "Try uploading clearer images if needed"
                ]
            )
        
        if not translate_request.targetLang.strip():
            return StudentFriendlyResponse(
                success=False,
                message="😔 Please tell me which language you want!",
                suggestions=[
                    "Enter a language like 'Hindi', 'Spanish', or 'French'",
                    "You can use the language name in English",
                    "Try common languages like 'Chinese' or 'Arabic'"
                ]
            )
        
        # Create translation prompt
        prompt = f"""
        Please translate the following text to {translate_request.targetLang}.

        Guidelines:
        - Provide accurate, natural translation
        - Maintain the original meaning and context
        - Use appropriate formality level for students
        - If the text contains educational content, preserve the learning value
        - If translation is not possible, explain why in a student-friendly way

        Text to translate:
        {translate_request.text}

        Please provide the translation in {translate_request.targetLang}:
        """
        
        # Generate translation using Gemini
        response = await api_manager.generate_content(
            model=os.getenv("MODEL_TRANSLATE", "gemini-2.5-flash"),
            contents=prompt
        )
        
        translation_text = response.text if hasattr(response, 'text') else str(response)
        
        logger.info(f"✅ Translation completed: {len(translation_text)} characters")
        
        return {
            "success": True,
            "translations": [translation_text.strip()],  # Frontend expects array
            "target_language": translate_request.targetLang,
            "original_length": len(translate_request.text),
            "translation_length": len(translation_text)
        }
        
    except Exception as e:
        logger.error(f"❌ Translation failed: {e}")
        return StudentFriendlyResponse(
            success=False,
            message=f"😔 I had trouble translating to {translate_request.targetLang} right now.",
            suggestions=[
                "Please try again in a moment",
                "Make sure you spelled the language name correctly",
                "Try a more common language like 'Spanish' or 'French'",
                "Check your internet connection"
            ]
        )

@app.post("/qa")
@limiter.limit(f"{os.getenv('RATE_LIMIT_RPM', '60')}/minute")
async def answer_question(request: Request, qa_request: QARequest):
    """Answer questions about the extracted text content."""
    logger.info(f"❓ Answering question about content")
    
    try:
        if not qa_request.text.strip():
            return StudentFriendlyResponse(
                success=False,
                message="😔 I don't have any content to answer questions about!",
                suggestions=[
                    "Make sure you've extracted text from your images first",
                    "Upload your homework images and extract text",
                    "Then come back and ask your questions!"
                ]
            )
        
        if not qa_request.question.strip():
            return StudentFriendlyResponse(
                success=False,
                message="😔 I don't see a question to answer!",
                suggestions=[
                    "Type your question in the text box",
                    "Ask about anything in your homework content",
                    "Try questions like 'What is the main idea?' or 'Explain this concept'"
                ]
            )
        
        # Create Q&A prompt
        prompt = f"""
        You are a helpful educational assistant for students. Based on the following content, please answer the student's question.

        Guidelines:
        - Provide clear, accurate answers appropriate for students
        - Use simple, encouraging language
        - If the answer isn't in the content, say so politely
        - Give helpful explanations that aid learning
        - Be supportive and positive
        - If the question is unclear, ask for clarification

        Content:
        {qa_request.text}

        Student's Question: {qa_request.question}

        Please provide a helpful answer:
        """
        
        # Generate answer using Gemini
        response = await api_manager.generate_content(
            model=os.getenv("MODEL_QA", "gemini-2.5-flash"),
            contents=prompt
        )
        
        answer_text = response.text if hasattr(response, 'text') else str(response)
        
        logger.info(f"✅ Question answered: {len(answer_text)} characters")
        
        return {
            "success": True,
            "answer": answer_text.strip(),
            "question": qa_request.question,
            "content_length": len(qa_request.text)
        }
        
    except Exception as e:
        logger.error(f"❌ Q&A failed: {e}")
        return StudentFriendlyResponse(
            success=False,
            message="😔 I had trouble answering your question right now.",
            suggestions=[
                "Please try asking your question again",
                "Make sure your question is clear and specific",
                "Check your internet connection",
                "Try rephrasing your question in simpler words"
            ]
        )

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8080"))
    
    logger.info("🚀 Starting KiddyVerse Backend...")
    logger.info(f"✨ Where Learning Meets Magic - AI Educational Assistant")
    logger.info(f"🔑 API Keys: Primary={'✅' if api_manager.primary_client else '❌'}, Backup={'✅' if api_manager.backup_client else '❌'}")
    
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)