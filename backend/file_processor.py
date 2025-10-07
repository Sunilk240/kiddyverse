"""
Smart File Processor for Kiddyverse V2.0
Handles file validation, PDF processing, and maintains 5 image/page limits.
"""

import os
import io
import logging
from typing import List, Tuple, Optional, Dict, Any
from PIL import Image
import PyPDF2
from fastapi import UploadFile, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from session_storage import session_storage, StoredFile

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class FileMetadata(BaseModel):
    """Metadata for uploaded files."""
    filename: str
    file_type: str
    size_bytes: int
    mime_type: str
    is_pdf: bool = False
    page_count: Optional[int] = None

class ProcessedFile(BaseModel):
    """Processed file with extracted content."""
    filename: str
    file_type: str
    content_type: str  # "image", "pdf_text", "pdf_images"
    text_content: Optional[str] = None
    image_count: int = 0  # Number of images processed
    page_number: Optional[int] = None
    file_size_mb: float = 0.0

class FileProcessingResult(BaseModel):
    """Result of file processing operation."""
    success: bool
    message: str
    processed_files: List[ProcessedFile] = []
    total_images: int = 0
    suggestions: List[str] = []
    error_details: Optional[str] = None
    session_id: Optional[str] = None  # Session ID for accessing stored files

class SmartFileProcessor:
    """Smart file processor with student-friendly limits and error handling."""
    
    def __init__(self):
        self.max_images = int(os.getenv("MAX_IMAGES", "5"))
        self.max_pdf_pages = int(os.getenv("MAX_PDF_PAGES", "5"))
        self.max_file_size_mb = int(os.getenv("MAX_FILE_SIZE_MB", "10"))
        self.max_file_size_bytes = self.max_file_size_mb * 1024 * 1024
        
        # Supported file types
        self.supported_image_types = {
            "image/jpeg", "image/jpg", "image/png", "image/gif", 
            "image/bmp", "image/webp", "image/tiff"
        }
        self.supported_pdf_type = "application/pdf"
        
        logger.info(f"📁 File Processor initialized: Max {self.max_images} images, {self.max_pdf_pages} PDF pages")
    
    def _get_student_friendly_error(self, error_type: str, **kwargs) -> Dict[str, Any]:
        """Get student-friendly error messages."""
        errors = {
            "too_many_files": {
                "title": "Oops! Too many files! 📚",
                "message": f"I can only read {self.max_images} images or PDF pages at a time. You uploaded {kwargs.get('count', 0)} items.",
                "suggestions": [
                    f"Try uploading only your {self.max_images} most important pages",
                    "Split your PDF into smaller parts",
                    "Choose the pages that have the most important information"
                ]
            },
            "file_too_large": {
                "title": "File is too big! 📏",
                "message": f"The file '{kwargs.get('filename', 'unknown')}' is {kwargs.get('size_mb', 0):.1f}MB, but I can only handle files up to {self.max_file_size_mb}MB.",
                "suggestions": [
                    "Try taking a clearer photo instead of scanning",
                    "Reduce the PDF file size using a PDF compressor",
                    "Split large PDFs into smaller parts"
                ]
            },
            "pdf_too_many_pages": {
                "title": "PDF has too many pages! 📄",
                "message": f"Your PDF has {kwargs.get('pages', 0)} pages, but I can only read {self.max_pdf_pages} pages at a time.",
                "suggestions": [
                    f"Split your PDF to show only the first {self.max_pdf_pages} pages",
                    "Choose the most important pages for your homework",
                    "Upload the pages as separate images instead"
                ]
            },
            "unsupported_file": {
                "title": "I can't read this file type! 🤔",
                "message": f"I don't know how to read '{kwargs.get('filename', 'this file')}'. I can only read images (JPG, PNG) and PDF files.",
                "suggestions": [
                    "Try converting your file to JPG or PNG format",
                    "Take a photo of the document instead",
                    "Save your document as a PDF file"
                ]
            },
            "no_files": {
                "title": "No files to process! 📭",
                "message": "You didn't upload any files. I need something to read!",
                "suggestions": [
                    "Click the upload button to choose your images or PDF",
                    "Make sure your files are selected before clicking upload",
                    "Try refreshing the page if the upload isn't working"
                ]
            },
            "corrupted_file": {
                "title": "File seems damaged! 😔",
                "message": f"I'm having trouble reading '{kwargs.get('filename', 'this file')}'. It might be damaged or corrupted.",
                "suggestions": [
                    "Try uploading the file again",
                    "Take a new photo if this was a photo",
                    "Check if the file opens correctly on your device"
                ]
            }
        }
        
        return errors.get(error_type, {
            "title": "Something went wrong! 😅",
            "message": "I encountered an unexpected problem while processing your files.",
            "suggestions": [
                "Please try uploading your files again",
                "Make sure your files are not too large",
                "Ask your teacher or parent for help if this keeps happening"
            ]
        })
    
    def _validate_file_basic(self, file: UploadFile) -> Optional[str]:
        """Basic file validation. Returns error type if invalid, None if valid."""
        
        # Check file size
        if hasattr(file, 'size') and file.size and file.size > self.max_file_size_bytes:
            return "file_too_large"
        
        # Check file type
        if file.content_type not in self.supported_image_types and file.content_type != self.supported_pdf_type:
            return "unsupported_file"
        
        return None
    
    def _count_pdf_pages(self, pdf_content: bytes) -> int:
        """Count pages in PDF content."""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            return len(pdf_reader.pages)
        except Exception as e:
            logger.error(f"Error counting PDF pages: {e}")
            raise HTTPException(status_code=400, detail="corrupted_file")
    
    def _extract_text_from_pdf(self, pdf_content: bytes) -> Tuple[str, List[str]]:
        """Extract text from PDF. Returns (combined_text, page_texts)."""
        try:
            pdf_reader = PyPDF2.PdfReader(io.BytesIO(pdf_content))
            page_texts = []
            
            for page_num, page in enumerate(pdf_reader.pages[:self.max_pdf_pages]):
                try:
                    text = page.extract_text().strip()
                    if text:
                        page_texts.append(f"=== Page {page_num + 1} ===\n{text}")
                    else:
                        page_texts.append(f"=== Page {page_num + 1} ===\n[This page appears to contain images or no readable text]")
                except Exception as e:
                    logger.warning(f"Error extracting text from page {page_num + 1}: {e}")
                    page_texts.append(f"=== Page {page_num + 1} ===\n[Could not read this page]")
            
            combined_text = "\n\n".join(page_texts)
            return combined_text, page_texts
            
        except Exception as e:
            logger.error(f"Error extracting PDF text: {e}")
            return "", []
    
    def _pdf_to_images(self, pdf_content: bytes) -> List[bytes]:
        """Convert PDF pages to images. Returns list of image bytes."""
        try:
            # For now, we'll return empty list and handle PDF as text
            # In a full implementation, you'd use pdf2image library
            logger.info("PDF to image conversion not implemented yet - treating as text PDF")
            return []
        except Exception as e:
            logger.error(f"Error converting PDF to images: {e}")
            return []
    
    def _resize_image(self, image_bytes: bytes, max_dimension: int = 2000) -> bytes:
        """Resize image if it's too large."""
        try:
            image = Image.open(io.BytesIO(image_bytes))
            
            # Check if resize is needed
            if max(image.size) <= max_dimension:
                return image_bytes
            
            # Calculate new size
            width, height = image.size
            if width > height:
                new_width = max_dimension
                new_height = int(height * (max_dimension / width))
            else:
                new_height = max_dimension
                new_width = int(width * (max_dimension / height))
            
            # Resize image
            resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
            # Save to bytes
            output = io.BytesIO()
            format = image.format or 'PNG'
            resized_image.save(output, format=format, quality=85, optimize=True)
            
            return output.getvalue()
            
        except Exception as e:
            logger.error(f"Error resizing image: {e}")
            return image_bytes  # Return original if resize fails
    
    async def validate_and_process_files(self, files: List[UploadFile]) -> FileProcessingResult:
        """Validate and process uploaded files with student-friendly error handling."""
        
        if not files:
            error_info = self._get_student_friendly_error("no_files")
            return FileProcessingResult(
                success=False,
                message=error_info["message"],
                suggestions=error_info["suggestions"]
            )
        
        processed_files = []
        total_image_count = 0
        
        try:
            # First pass: validate all files and count total images
            file_metadata = []
            
            for file in files:
                # Read file content
                content = await file.read()
                await file.seek(0)  # Reset file pointer
                
                # Basic validation
                error_type = self._validate_file_basic(file)
                if error_type:
                    error_info = self._get_student_friendly_error(
                        error_type,
                        filename=file.filename,
                        size_mb=len(content) / (1024 * 1024)
                    )
                    return FileProcessingResult(
                        success=False,
                        message=error_info["message"],
                        suggestions=error_info["suggestions"],
                        error_details=error_info["title"]
                    )
                
                # Create metadata
                metadata = FileMetadata(
                    filename=file.filename or "unknown",
                    file_type=file.content_type or "unknown",
                    size_bytes=len(content),
                    mime_type=file.content_type or "unknown",
                    is_pdf=file.content_type == self.supported_pdf_type
                )
                
                # Count pages/images
                if metadata.is_pdf:
                    try:
                        page_count = self._count_pdf_pages(content)
                        metadata.page_count = page_count
                        
                        # Check PDF page limit
                        if page_count > self.max_pdf_pages:
                            error_info = self._get_student_friendly_error(
                                "pdf_too_many_pages",
                                filename=file.filename,
                                pages=page_count
                            )
                            return FileProcessingResult(
                                success=False,
                                message=error_info["message"],
                                suggestions=error_info["suggestions"],
                                error_details=error_info["title"]
                            )
                        
                        total_image_count += page_count
                    except Exception as e:
                        error_info = self._get_student_friendly_error(
                            "corrupted_file",
                            filename=file.filename
                        )
                        return FileProcessingResult(
                            success=False,
                            message=error_info["message"],
                            suggestions=error_info["suggestions"],
                            error_details=str(e)
                        )
                else:
                    # Regular image file
                    total_image_count += 1
                
                file_metadata.append((metadata, content))
            
            # Check total image count
            if total_image_count > self.max_images:
                error_info = self._get_student_friendly_error(
                    "too_many_files",
                    count=total_image_count
                )
                return FileProcessingResult(
                    success=False,
                    message=error_info["message"],
                    suggestions=error_info["suggestions"]
                )
            
            # Create session for storing processed files
            session_id = session_storage.create_session()
            stored_files = []
            
            # Second pass: process all files
            for metadata, content in file_metadata:
                if metadata.is_pdf:
                    # Process PDF
                    text_content, page_texts = self._extract_text_from_pdf(content)
                    
                    if text_content.strip():
                        # PDF has readable text - store the text
                        stored_file = StoredFile(
                            filename=metadata.filename,
                            content_type="pdf_text",
                            data=content,  # Store original PDF
                            text_content=text_content
                        )
                        stored_files.append(stored_file)
                        
                        processed_file = ProcessedFile(
                            filename=metadata.filename,
                            file_type=metadata.file_type,
                            content_type="pdf_text",
                            text_content=text_content,
                            file_size_mb=round(metadata.size_bytes / (1024 * 1024), 2)
                        )
                    else:
                        # PDF needs OCR (convert to images)
                        pdf_images = self._pdf_to_images(content)
                        
                        # Store each page as a separate image
                        for page_num in range(metadata.page_count or 0):
                            stored_file = StoredFile(
                                filename=f"{metadata.filename}_page_{page_num + 1}",
                                content_type="pdf_images",
                                data=content,  # For now, store original PDF
                                page_number=page_num + 1
                            )
                            stored_files.append(stored_file)
                        
                        processed_file = ProcessedFile(
                            filename=metadata.filename,
                            file_type=metadata.file_type,
                            content_type="pdf_images",
                            image_count=metadata.page_count or 0,
                            file_size_mb=round(metadata.size_bytes / (1024 * 1024), 2)
                        )
                    
                    processed_files.append(processed_file)
                    
                else:
                    # Process image file
                    resized_content = self._resize_image(content)
                    
                    # Store the processed image
                    stored_file = StoredFile(
                        filename=metadata.filename,
                        content_type="image",
                        data=resized_content
                    )
                    stored_files.append(stored_file)
                    
                    processed_file = ProcessedFile(
                        filename=metadata.filename,
                        file_type=metadata.file_type,
                        content_type="image",
                        image_count=1,
                        file_size_mb=round(metadata.size_bytes / (1024 * 1024), 2)
                    )
                    
                    processed_files.append(processed_file)
            
            # Store all processed files in session
            session_storage.store_files(session_id, stored_files)
            
            # Success!
            return FileProcessingResult(
                success=True,
                message=f"🎉 Great! I successfully processed {len(processed_files)} file(s) with {total_image_count} image(s) to read!",
                processed_files=processed_files,
                total_images=total_image_count,
                session_id=session_id,
                suggestions=[
                    "Now I can extract text from your images!",
                    "Click 'Extract Text' to see what I found!",
                    "This might take 30-60 seconds depending on how much text there is."
                ]
            )
            
        except Exception as e:
            logger.error(f"Unexpected error processing files: {e}")
            error_info = self._get_student_friendly_error("general_error")
            return FileProcessingResult(
                success=False,
                message=error_info["message"],
                suggestions=error_info["suggestions"],
                error_details=str(e)
            )

# Global file processor instance
file_processor = SmartFileProcessor()