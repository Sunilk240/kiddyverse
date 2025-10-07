"""
Dual API Key Manager for Kiddyverse V2.0
Handles automatic failover between primary and backup Gemini API keys.
"""

import os
import logging
import time
from typing import Optional, Dict, Any
from google import genai
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

class APIManager:
    """Manages dual Gemini API keys with automatic failover."""
    
    def __init__(self):
        self.primary_key = os.getenv("GEMINI_API_KEY_1")
        self.backup_key = os.getenv("GEMINI_API_KEY_2")
        
        # Client instances
        self.primary_client: Optional[genai.Client] = None
        self.backup_client: Optional[genai.Client] = None
        self.current_client: Optional[genai.Client] = None
        
        # Failover tracking
        self.using_backup = False
        self.failover_count = 0
        self.last_failover_time: Optional[datetime] = None
        self.primary_retry_time: Optional[datetime] = None
        
        # Rate limiting tracking
        self.request_counts = {"primary": 0, "backup": 0}
        self.last_reset_time = datetime.now()
        
        # Initialize clients
        self._initialize_clients()
    
    def _initialize_clients(self):
        """Initialize API clients and validate keys."""
        if self.primary_key and self.primary_key != "your_primary_gemini_api_key_here":
            try:
                self.primary_client = genai.Client(api_key=self.primary_key)
                self.current_client = self.primary_client
                logger.info("✅ Primary Gemini API key initialized")
            except Exception as e:
                logger.error(f"❌ Failed to initialize primary API key: {e}")
        else:
            logger.warning("⚠️ Primary API key not set or using placeholder")
        
        if self.backup_key and self.backup_key != "your_backup_gemini_api_key_here":
            try:
                self.backup_client = genai.Client(api_key=self.backup_key)
                if not self.current_client:  # Use backup as primary if no primary
                    self.current_client = self.backup_client
                logger.info("✅ Backup Gemini API key initialized")
            except Exception as e:
                logger.error(f"❌ Failed to initialize backup API key: {e}")
        else:
            logger.warning("⚠️ Backup API key not set or using placeholder")
        
        if not self.primary_client and not self.backup_client:
            logger.error("❌ No valid API keys found! Set GEMINI_API_KEY_1 and/or GEMINI_API_KEY_2")
    
    def _should_retry_primary(self) -> bool:
        """Check if we should retry the primary key."""
        if not self.using_backup or not self.primary_retry_time:
            return False
        
        # Retry primary after 5 minutes
        return datetime.now() > self.primary_retry_time
    
    def _reset_rate_limits(self):
        """Reset rate limit counters if needed."""
        now = datetime.now()
        if now - self.last_reset_time > timedelta(minutes=1):
            self.request_counts = {"primary": 0, "backup": 0}
            self.last_reset_time = now
    
    def _is_rate_limit_error(self, error: Exception) -> bool:
        """Check if error is due to rate limiting."""
        error_str = str(error).lower()
        return any(term in error_str for term in [
            "rate limit", "quota", "too many requests", "429"
        ])
    
    def _is_api_key_error(self, error: Exception) -> bool:
        """Check if error is due to invalid API key."""
        error_str = str(error).lower()
        return any(term in error_str for term in [
            "api key", "invalid", "unauthorized", "401", "403"
        ])
    
    def _failover_to_backup(self, reason: str):
        """Switch to backup API key."""
        if not self.backup_client:
            logger.error("❌ No backup API key available for failover")
            return False
        
        self.using_backup = True
        self.current_client = self.backup_client
        self.failover_count += 1
        self.last_failover_time = datetime.now()
        self.primary_retry_time = datetime.now() + timedelta(minutes=5)
        
        logger.warning(f"🔄 Switched to backup API key. Reason: {reason}")
        return True
    
    def _failback_to_primary(self):
        """Switch back to primary API key."""
        if not self.primary_client:
            return False
        
        self.using_backup = False
        self.current_client = self.primary_client
        self.primary_retry_time = None
        
        logger.info("🔄 Switched back to primary API key")
        return True
    
    async def get_client(self) -> Optional[genai.Client]:
        """Get the current active client with automatic failover."""
        self._reset_rate_limits()
        
        # Try to failback to primary if it's time
        if self._should_retry_primary():
            self._failback_to_primary()
        
        return self.current_client
    
    async def generate_content(self, model: str, contents: Any, **kwargs) -> Any:
        """Generate content with automatic failover on errors."""
        client = await self.get_client()
        
        if not client:
            raise Exception("No API keys available")
        
        # Track request count
        key_type = "backup" if self.using_backup else "primary"
        self.request_counts[key_type] += 1
        
        try:
            # Use the correct API format
            response = client.models.generate_content(
                model=model,
                contents=contents,
                **kwargs
            )
            
            # Success - reset any error states
            if self.using_backup and self._should_retry_primary():
                # Try primary again on next request
                pass
            
            return response
            
        except Exception as e:
            logger.error(f"❌ API error with {key_type} key: {e}")
            
            # Handle different types of errors
            if self._is_rate_limit_error(e):
                if not self.using_backup and self.backup_client:
                    # Rate limited on primary, try backup
                    if self._failover_to_backup(f"Rate limit on primary: {e}"):
                        return await self.generate_content(model, contents, **kwargs)
                else:
                    # Rate limited on backup too
                    raise Exception("Both API keys are rate limited. Please try again later.")
            
            elif self._is_api_key_error(e):
                if not self.using_backup and self.backup_client:
                    # API key issue on primary, try backup
                    if self._failover_to_backup(f"API key error on primary: {e}"):
                        return await self.generate_content(model, contents, **kwargs)
                else:
                    # API key issue on backup too
                    raise Exception("API key authentication failed on both keys.")
            
            else:
                # Other errors - try backup if available
                if not self.using_backup and self.backup_client:
                    if self._failover_to_backup(f"General error on primary: {e}"):
                        return await self.generate_content(model, contents, **kwargs)
                
                # Re-raise the original error
                raise e
    
    def get_status(self) -> Dict[str, Any]:
        """Get current API manager status."""
        return {
            "primary_key_available": bool(self.primary_client),
            "backup_key_available": bool(self.backup_client),
            "using_backup": self.using_backup,
            "failover_count": self.failover_count,
            "last_failover": self.last_failover_time.isoformat() if self.last_failover_time else None,
            "request_counts": self.request_counts.copy(),
            "healthy": bool(self.current_client)
        }

# Global API manager instance
api_manager = APIManager()