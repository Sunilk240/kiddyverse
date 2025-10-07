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

# Configure detailed logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Set specific loggers for debugging
logging.getLogger("api_manager").setLevel(logging.DEBUG)
logging.getLogger("ocr_pipeline").setLevel(logging.DEBUG)
logging.getLogger("file_processor").setLevel(logging.DEBUG)

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

# CORS configuration - Use environment variable for allowed origins
allowed_origins_env = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
# Support multiple origins separated by commas
allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",")]

logger.info(f"🔒 CORS Allowed Origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS", "PUT", "DELETE", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Universal middleware to handle double slash URLs and add CORS headers
@app.middleware("http")
async def fix_double_slash_and_cors_middleware(request: Request, call_next):
    """Fix double slash URLs and ensure CORS headers are present."""
    original_path = request.url.path
    origin = request.headers.get("origin", "*")
    
    # Check if path has double slashes (but not root //)
    if "//" in original_path and original_path != "/":
        # Fix the path by replacing double slashes with single slash
        fixed_path = original_path.replace("//", "/")
        logger.info(f"🔄 FIXING DOUBLE SLASH: {original_path} -> {fixed_path}")
        
        # Create new scope with fixed path
        scope = request.scope.copy()
        scope["path"] = fixed_path
        scope["raw_path"] = fixed_path.encode()
        
        # Create new request with fixed path
        from starlette.requests import Request as StarletteRequest
        fixed_request = StarletteRequest(scope, request.receive)
        
        # Process the fixed request
        response = await call_next(fixed_request)
    else:
        # Normal processing for correct URLs
        response = await call_next(request)
    
    # Add CORS headers to all responses using environment variable
    allowed_origins_env = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
    allowed_origins_list = [origin.strip() for origin in allowed_origins_env.split(",")]
    
    if origin in allowed_origins_list:
        response.headers["Access-Control-Allow-Origin"] = origin
    else:
        response.headers["Access-Control-Allow-Origin"] = allowed_origins_list[0]
    
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS, PUT, DELETE, PATCH"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Requested-With, Accept, Origin"
    response.headers["Access-Control-Allow-Credentials"] = "false"
    
    return response

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



# Catch-all OPTIONS handler (must be before other routes)
@app.options("/{path:path}")
async def universal_options_handler(request: Request, path: str):
    """Handle ALL OPTIONS requests for CORS preflight."""
    origin = request.headers.get("origin", "*")
    logger.info(f"🔍 OPTIONS REQUEST: /{path} from origin: {origin}")
    
    # Get allowed origins from environment
    allowed_origins_env = os.getenv("ALLOWED_ORIGIN", "http://localhost:5173")
    allowed_origins_list = [origin.strip() for origin in allowed_origins_env.split(",")]
    
    return JSONResponse(
        content={"message": "CORS preflight successful", "path": f"/{path}", "origin": origin},
        headers={
            "Access-Control-Allow-Origin": origin if origin in allowed_origins_list else allowed_origins_list[0],
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE, PATCH",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, Accept, Origin",
            "Access-Control-Max-Age": "86400",
            "Access-Control-Allow-Credentials": "false",
        }
    )

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
    logger.info(f"🔍 OCR REQUEST - Session: {ocr_request.session_id}, Handwritten: {ocr_request.is_handwritten}")
    
    try:
        # Step 1: Check if session exists
        logger.info("🔍 STEP 1: Checking session existence...")
        session_info = session_storage.get_session_info(ocr_request.session_id)
        logger.info(f"🔍 SESSION INFO: {session_info}")
        
        if not session_info.get("exists"):
            logger.warning(f"❌ SESSION NOT FOUND: {ocr_request.session_id}")
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
        
        logger.info(f"✅ SESSION FOUND: {ocr_request.session_id}")
        
        # Step 2: Process with OCR pipeline
        logger.info("🔍 STEP 2: Starting OCR pipeline processing...")
        logger.info(f"🤖 HANDWRITTEN MODE: {ocr_request.is_handwritten}")
        
        try:
            result = await ocr_pipeline.process_session(
                session_id=ocr_request.session_id,
                is_handwritten=ocr_request.is_handwritten
            )
            logger.info("✅ OCR PIPELINE COMPLETED")
            
        except Exception as ocr_error:
            logger.error(f"❌ OCR PIPELINE FAILED: {str(ocr_error)}")
            logger.error(f"❌ OCR ERROR TYPE: {type(ocr_error).__name__}")
            raise ocr_error
        
        # Step 3: Process results
        logger.info("🔍 STEP 3: Processing OCR results...")
        logger.info(f"🔍 OCR SUCCESS: {result.success}")
        logger.info(f"🔍 FILES PROCESSED: {result.total_files_processed}")
        logger.info(f"🔍 TEXT LENGTH: {len(result.combined_text)} characters")
        
        if result.success:
            logger.info(f"✅ OCR COMPLETED SUCCESSFULLY for session {ocr_request.session_id}")
        else:
            logger.warning(f"❌ OCR FAILED for session {ocr_request.session_id}: {result.message}")
        
        return result
        
    except Exception as e:
        logger.error(f"❌ OCR ENDPOINT FAILED: {str(e)}")
        logger.error(f"❌ ERROR TYPE: {type(e).__name__}")
        logger.error(f"❌ ERROR DETAILS: {repr(e)}")
        
        # Log the full traceback for debugging
        import traceback
        logger.error(f"❌ FULL TRACEBACK:\n{traceback.format_exc()}")
        
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
    logger.info(f"📝 SUMMARIZE REQUEST - Grade: {summarize_request.classLevel}, Text length: {len(summarize_request.text)} chars")
    
    try:
        # Step 1: Validate input
        logger.info("🔍 STEP 1: Validating input text...")
        if not summarize_request.text.strip():
            logger.warning("❌ VALIDATION FAILED: Empty text provided")
            return StudentFriendlyResponse(
                success=False,
                message="😔 I don't see any text to summarize!",
                suggestions=[
                    "Make sure you've extracted text from your images first",
                    "Check that your images contain readable text",
                    "Try uploading clearer images if needed"
                ]
            )
        
        logger.info(f"✅ VALIDATION PASSED: Text has {len(summarize_request.text)} characters")
        
        # Step 2: Create grade-appropriate prompt
        logger.info("🔍 STEP 2: Creating grade-appropriate prompt...")
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
        
        logger.info(f"✅ PROMPT CREATED: {len(prompt)} characters for grade {grade_level}")
        
        # Step 3: Call Gemini API
        logger.info("🔍 STEP 3: Calling Gemini API for summarization...")
        logger.info(f"🤖 API MODEL: {os.getenv('MODEL_SUMMARIZE', 'gemini-2.5-flash')}")
        
        try:
            response = await api_manager.generate_content(
                model=os.getenv("MODEL_SUMMARIZE", "gemini-2.5-flash"),
                contents=prompt
            )
            logger.info("✅ GEMINI API CALL SUCCESSFUL")
            
        except Exception as api_error:
            logger.error(f"❌ GEMINI API CALL FAILED: {str(api_error)}")
            logger.error(f"❌ API ERROR TYPE: {type(api_error).__name__}")
            raise api_error
        
        # Step 4: Process response
        logger.info("🔍 STEP 4: Processing Gemini response...")
        logger.info(f"🔍 RESPONSE TYPE: {type(response)}")
        logger.info(f"🔍 RESPONSE ATTRIBUTES: {dir(response)}")
        
        if hasattr(response, 'text'):
            summary_text = response.text
            logger.info(f"✅ EXTRACTED TEXT FROM response.text: {len(summary_text)} chars")
        else:
            summary_text = str(response)
            logger.info(f"✅ CONVERTED RESPONSE TO STRING: {len(summary_text)} chars")
        
        logger.info(f"✅ SUMMARY CREATED SUCCESSFULLY: {len(summary_text)} characters")
        
        return {
            "success": True,
            "summary": summary_text.strip(),
            "grade_level": grade_level,
            "original_length": len(summarize_request.text),
            "summary_length": len(summary_text)
        }
        
    except Exception as e:
        logger.error(f"❌ SUMMARIZE ENDPOINT FAILED: {str(e)}")
        logger.error(f"❌ ERROR TYPE: {type(e).__name__}")
        logger.error(f"❌ ERROR DETAILS: {repr(e)}")
        
        # Log the full traceback for debugging
        import traceback
        logger.error(f"❌ FULL TRACEBACK:\n{traceback.format_exc()}")
        
        return StudentFriendlyResponse(
            success=False,
            message="😔 I had trouble creating a summary right now.",
            suggestions=[
                "Please try again in a moment",
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