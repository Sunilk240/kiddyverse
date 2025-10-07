"""
Session-based storage for Kiddyverse V2.0
Temporarily stores processed files for OCR processing.
"""

import os
import uuid
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import threading
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class StoredFile:
    """Stored file data for OCR processing."""
    filename: str
    content_type: str  # "image", "pdf_text", "pdf_images"
    data: bytes  # Raw file data or processed image data
    text_content: Optional[str] = None
    page_number: Optional[int] = None
    created_at: datetime = None
    
    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.now()

class SessionStorage:
    """Thread-safe session storage for temporary file data."""
    
    def __init__(self):
        self._storage: Dict[str, Dict[str, List[StoredFile]]] = {}
        self._lock = threading.Lock()
        self._cleanup_interval = timedelta(hours=1)  # Clean up after 1 hour
        
        logger.info("📦 Session storage initialized")
    
    def create_session(self) -> str:
        """Create a new session and return session ID."""
        session_id = str(uuid.uuid4())
        
        with self._lock:
            self._storage[session_id] = {}
        
        logger.info(f"🆕 Created session: {session_id}")
        return session_id
    
    def store_files(self, session_id: str, files: List[StoredFile]) -> bool:
        """Store files in a session."""
        try:
            with self._lock:
                if session_id not in self._storage:
                    self._storage[session_id] = {}
                
                # Group files by content type
                for file in files:
                    content_type = file.content_type
                    if content_type not in self._storage[session_id]:
                        self._storage[session_id][content_type] = []
                    
                    self._storage[session_id][content_type].append(file)
            
            logger.info(f"💾 Stored {len(files)} files in session {session_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Error storing files in session {session_id}: {e}")
            return False
    
    def get_files(self, session_id: str, content_type: Optional[str] = None) -> List[StoredFile]:
        """Get files from a session, optionally filtered by content type."""
        try:
            with self._lock:
                if session_id not in self._storage:
                    return []
                
                if content_type:
                    return self._storage[session_id].get(content_type, [])
                else:
                    # Return all files from all content types
                    all_files = []
                    for files_list in self._storage[session_id].values():
                        all_files.extend(files_list)
                    return all_files
                    
        except Exception as e:
            logger.error(f"❌ Error getting files from session {session_id}: {e}")
            return []
    
    def get_session_info(self, session_id: str) -> Dict[str, Any]:
        """Get information about a session."""
        try:
            with self._lock:
                if session_id not in self._storage:
                    return {"exists": False}
                
                session_data = self._storage[session_id]
                total_files = sum(len(files) for files in session_data.values())
                content_types = list(session_data.keys())
                
                # Get creation time from first file
                creation_time = None
                for files_list in session_data.values():
                    if files_list:
                        creation_time = files_list[0].created_at
                        break
                
                return {
                    "exists": True,
                    "total_files": total_files,
                    "content_types": content_types,
                    "created_at": creation_time.isoformat() if creation_time else None
                }
                
        except Exception as e:
            logger.error(f"❌ Error getting session info {session_id}: {e}")
            return {"exists": False, "error": str(e)}
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session and all its data."""
        try:
            with self._lock:
                if session_id in self._storage:
                    del self._storage[session_id]
                    logger.info(f"🗑️ Deleted session: {session_id}")
                    return True
                return False
                
        except Exception as e:
            logger.error(f"❌ Error deleting session {session_id}: {e}")
            return False
    
    def cleanup_old_sessions(self):
        """Clean up sessions older than the cleanup interval."""
        try:
            current_time = datetime.now()
            sessions_to_delete = []
            
            with self._lock:
                for session_id, session_data in self._storage.items():
                    # Find the oldest file in the session
                    oldest_time = current_time
                    for files_list in session_data.values():
                        for file in files_list:
                            if file.created_at < oldest_time:
                                oldest_time = file.created_at
                    
                    # Mark for deletion if too old
                    if current_time - oldest_time > self._cleanup_interval:
                        sessions_to_delete.append(session_id)
            
            # Delete old sessions
            for session_id in sessions_to_delete:
                self.delete_session(session_id)
            
            if sessions_to_delete:
                logger.info(f"🧹 Cleaned up {len(sessions_to_delete)} old sessions")
                
        except Exception as e:
            logger.error(f"❌ Error during cleanup: {e}")
    
    def get_storage_stats(self) -> Dict[str, Any]:
        """Get storage statistics."""
        try:
            with self._lock:
                total_sessions = len(self._storage)
                total_files = sum(
                    sum(len(files) for files in session_data.values())
                    for session_data in self._storage.values()
                )
                
                return {
                    "total_sessions": total_sessions,
                    "total_files": total_files,
                    "cleanup_interval_hours": self._cleanup_interval.total_seconds() / 3600
                }
                
        except Exception as e:
            logger.error(f"❌ Error getting storage stats: {e}")
            return {"error": str(e)}

# Global session storage instance
session_storage = SessionStorage()