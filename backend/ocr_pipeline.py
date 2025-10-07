"""
Sequential OCR Processing Pipeline for Kiddyverse V2.0
Processes images one by one to maintain context and combine results intelligently.
"""

import os
import io
import base64
import logging
from typing import List, Dict, Any, Optional, Tuple
from PIL import Image
from pydantic import BaseModel
from dotenv import load_dotenv

from api_manager import api_manager
from session_storage import session_storage, StoredFile

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class OCRResult(BaseModel):
    """Result from OCR processing of a single file."""
    filename: str
    content_type: str
    extracted_text: str
    confidence_score: float = 0.0
    processing_time_seconds: float = 0.0
    page_number: Optional[int] = None
    error_message: Optional[str] = None

class OCRPipelineResult(BaseModel):
    """Result from the complete OCR pipeline."""
    success: bool
    message: str
    session_id: str
    total_files_processed: int
    combined_text: str
    individual_results: List[OCRResult] = []
    processing_time_seconds: float = 0.0
    suggestions: List[str] = []
    error_details: Optional[str] = None

class SequentialOCRPipeline:
    """Sequential OCR pipeline that processes images one by one."""
    
    def __init__(self):
        self.ocr_model = os.getenv("MODEL_OCR", "gemini-2.5-flash")
        logger.info(f"🔍 OCR Pipeline initialized with model: {self.ocr_model}")
    
    def _get_student_friendly_message(self, message_type: str, **kwargs) -> Dict[str, Any]:
        """Get student-friendly messages for OCR results."""
        messages = {
            "processing_start": {
                "title": "Reading your content! 👀",
                "message": f"I'm carefully reading {kwargs.get('file_count', 0)} file(s) to extract all the text.",
                "suggestions": [
                    "This usually takes 30-60 seconds",
                    "I'm reading each image one by one for the best results",
                    "Please wait while I work my magic! ✨"
                ]
            },
            "processing_success": {
                "title": "Great! I found lots of text! 📝",
                "message": f"I successfully read {kwargs.get('file_count', 0)} file(s) and found {kwargs.get('text_length', 0)} characters of text!",
                "suggestions": [
                    "Now you can ask me questions about this content",
                    "I can also summarize this for your grade level",
                    "Or translate it to another language if you need!"
                ]
            },
            "processing_partial": {
                "title": "I read most of your content! 📖",
                "message": f"I successfully read {kwargs.get('success_count', 0)} out of {kwargs.get('total_count', 0)} files.",
                "suggestions": [
                    "Some files might have been unclear or damaged",
                    "The text I found is still useful for your homework",
                    "Try uploading clearer images if you need better results"
                ]
            },
            "processing_failed": {
                "title": "I had trouble reading your content 😔",
                "message": "I couldn't extract text from your files. This might be because the images are unclear or the text is too small.",
                "suggestions": [
                    "Try taking clearer, brighter photos",
                    "Make sure the text is large enough to read",
                    "Check that your images aren't blurry or rotated"
                ]
            },
            "no_session": {
                "title": "I can't find your files! 🔍",
                "message": "It looks like your files weren't uploaded properly or the session expired.",
                "suggestions": [
                    "Please upload your files again",
                    "Make sure you click 'Upload' before trying to extract text",
                    "Try refreshing the page if this keeps happening"
                ]
            }
        }
        
        return messages.get(message_type, {
            "title": "Something happened! 🤔",
            "message": "I encountered an unexpected situation while processing your files.",
            "suggestions": [
                "Please try uploading your files again",
                "Make sure your images are clear and readable",
                "Ask for help if this problem continues"
            ]
        })
    
    def _image_to_base64(self, image_data: bytes) -> str:
        """Convert image bytes to base64 string."""
        return base64.b64encode(image_data).decode('utf-8')
    

    
    async def _process_with_gemini_ocr(self, image_data: bytes) -> Tuple[str, float]:
        """Process image with Gemini OCR. Returns (text, confidence)."""
        try:
            image_b64 = self._image_to_base64(image_data)
            
            # Create OCR prompt
            prompt = "Extract all readable text from this image. Do not summarize or interpret. Return only the plain text you can see, preserving the original formatting and line breaks as much as possible."
            
            # Call Gemini API for OCR with correct format
            response = await api_manager.generate_content(
                model=self.ocr_model,
                contents=[
                    {
                        "role": "user",
                        "parts": [
                            {"text": prompt},
                            {
                                "inline_data": {
                                    "mime_type": "image/png",
                                    "data": image_b64
                                }
                            }
                        ]
                    }
                ]
            )
            
            extracted_text = response.text if hasattr(response, 'text') else str(response)
            
            # Estimate confidence based on text length and content quality
            confidence = min(0.95, max(0.1, len(extracted_text.strip()) / 100))
            
            # Boost confidence if text looks well-structured
            if '\n' in extracted_text or len(extracted_text.split()) > 5:
                confidence = min(0.95, confidence + 0.1)
            
            logger.info(f"🤖 Gemini OCR: {len(extracted_text)} chars, confidence: {confidence:.2f}")
            
            return extracted_text, confidence
            
        except Exception as e:
            logger.error(f"❌ Gemini OCR failed: {e}")
            raise e
    
    def _detect_handwritten_content(self, image_data: bytes) -> bool:
        """Simple heuristic to detect if image likely contains handwritten text."""
        # For now, we'll rely on user input, but this could be enhanced with ML
        # Could analyze image characteristics like:
        # - Irregular text spacing
        # - Varied character sizes
        # - Non-uniform baselines
        return False  # Default to printed text
    
    def _extract_text_from_pdf_content(self, pdf_data: bytes) -> str:
        """Extract text directly from PDF content."""
        try:
            import PyPDF2
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_data))
            
            text_parts = []
            for page_num, page in enumerate(pdf_reader.pages[:5]):  # Limit to 5 pages
                try:
                    page_text = page.extract_text().strip()
                    if page_text:
                        text_parts.append(f"=== Page {page_num + 1} ===\n{page_text}")
                    else:
                        text_parts.append(f"=== Page {page_num + 1} ===\n[This page appears to contain images or no readable text]")
                except Exception as e:
                    logger.warning(f"Error extracting text from page {page_num + 1}: {e}")
                    text_parts.append(f"=== Page {page_num + 1} ===\n[Could not read this page]")
            
            return "\n\n".join(text_parts)
            
        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            return ""
    
    async def _process_single_image(self, stored_file: StoredFile, file_index: int, total_files: int, is_handwritten: bool = False) -> OCRResult:
        """Process a single image file with OCR."""
        import time
        start_time = time.time()
        
        try:
            logger.info(f"🔍 Processing file {file_index + 1}/{total_files}: {stored_file.filename}")
            
            # Handle different content types
            if stored_file.content_type == "pdf_text":
                # PDF with extractable text
                if stored_file.text_content:
                    extracted_text = stored_file.text_content
                else:
                    # Extract text from PDF data
                    extracted_text = self._extract_text_from_pdf_content(stored_file.data)
                
                processing_time = time.time() - start_time
                
                return OCRResult(
                    filename=stored_file.filename,
                    content_type=stored_file.content_type,
                    extracted_text=extracted_text,
                    confidence_score=1.0,  # High confidence for direct text extraction
                    processing_time_seconds=processing_time,
                    page_number=stored_file.page_number
                )
            
            elif stored_file.content_type in ["image", "pdf_images"]:
                # Image that needs OCR - backend only handles handwritten text with Gemini
                extracted_text, confidence = await self._process_with_gemini_ocr(stored_file.data)
                
                processing_time = time.time() - start_time
                
                return OCRResult(
                    filename=stored_file.filename,
                    content_type=f"{stored_file.content_type}_gemini_handwritten",
                    extracted_text=extracted_text,
                    confidence_score=confidence,
                    processing_time_seconds=processing_time,
                    page_number=stored_file.page_number
                )
            
            else:
                # Unknown content type
                processing_time = time.time() - start_time
                return OCRResult(
                    filename=stored_file.filename,
                    content_type=stored_file.content_type,
                    extracted_text="",
                    confidence_score=0.0,
                    processing_time_seconds=processing_time,
                    error_message=f"Unsupported content type: {stored_file.content_type}"
                )
                
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"❌ Error processing {stored_file.filename}: {e}")
            
            return OCRResult(
                filename=stored_file.filename,
                content_type=stored_file.content_type,
                extracted_text="",
                confidence_score=0.0,
                processing_time_seconds=processing_time,
                page_number=stored_file.page_number,
                error_message=str(e)
            )
    
    def _combine_ocr_results(self, results: List[OCRResult]) -> str:
        """Combine OCR results from multiple files into a single text."""
        combined_parts = []
        
        for i, result in enumerate(results):
            if result.extracted_text.strip():
                # Add separator for multiple files
                if i > 0:
                    if result.page_number:
                        combined_parts.append(f"\n\n=== {result.filename} (Page {result.page_number}) ===\n")
                    else:
                        combined_parts.append(f"\n\n=== {result.filename} ===\n")
                
                combined_parts.append(result.extracted_text.strip())
            else:
                # Add placeholder for failed extractions
                if result.error_message:
                    combined_parts.append(f"\n\n=== {result.filename} ===\n[Could not read this file: {result.error_message}]")
                else:
                    combined_parts.append(f"\n\n=== {result.filename} ===\n[No readable text found in this file]")
        
        return "\n".join(combined_parts).strip()
    
    async def process_session(self, session_id: str, is_handwritten: bool = False) -> OCRPipelineResult:
        """Process all files in a session with sequential OCR."""
        import time
        start_time = time.time()
        
        try:
            # Get files from session
            stored_files = session_storage.get_files(session_id)
            
            if not stored_files:
                error_info = self._get_student_friendly_message("no_session")
                return OCRPipelineResult(
                    success=False,
                    message=error_info["message"],
                    session_id=session_id,
                    total_files_processed=0,
                    combined_text="",
                    suggestions=error_info["suggestions"],
                    error_details=error_info["title"]
                )
            
            logger.info(f"🚀 Starting OCR pipeline for session {session_id} with {len(stored_files)} files")
            
            # Process files sequentially
            ocr_results = []
            for i, stored_file in enumerate(stored_files):
                result = await self._process_single_image(stored_file, i, len(stored_files), is_handwritten)
                ocr_results.append(result)
            
            # Combine results
            combined_text = self._combine_ocr_results(ocr_results)
            total_processing_time = time.time() - start_time
            
            # Calculate success metrics
            successful_results = [r for r in ocr_results if r.extracted_text.strip() and not r.error_message]
            success_rate = len(successful_results) / len(ocr_results) if ocr_results else 0
            
            # Determine result type and message
            if success_rate >= 0.8:  # 80% or more successful
                message_info = self._get_student_friendly_message(
                    "processing_success",
                    file_count=len(ocr_results),
                    text_length=len(combined_text)
                )
                success = True
            elif success_rate > 0:  # Partial success
                message_info = self._get_student_friendly_message(
                    "processing_partial",
                    success_count=len(successful_results),
                    total_count=len(ocr_results)
                )
                success = True
            else:  # Complete failure
                message_info = self._get_student_friendly_message("processing_failed")
                success = False
            
            logger.info(f"✅ OCR pipeline completed: {len(successful_results)}/{len(ocr_results)} files successful")
            
            return OCRPipelineResult(
                success=success,
                message=message_info["message"],
                session_id=session_id,
                total_files_processed=len(ocr_results),
                combined_text=combined_text,
                individual_results=ocr_results,
                processing_time_seconds=total_processing_time,
                suggestions=message_info["suggestions"]
            )
            
        except Exception as e:
            total_processing_time = time.time() - start_time
            logger.error(f"❌ OCR pipeline failed for session {session_id}: {e}")
            
            error_info = self._get_student_friendly_message("processing_failed")
            return OCRPipelineResult(
                success=False,
                message=error_info["message"],
                session_id=session_id,
                total_files_processed=0,
                combined_text="",
                processing_time_seconds=total_processing_time,
                suggestions=error_info["suggestions"],
                error_details=str(e)
            )

# Global OCR pipeline instance
ocr_pipeline = SequentialOCRPipeline()