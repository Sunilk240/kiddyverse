import React, { useState } from 'react'

function ProcessingIndicator({ 
  apiBaseUrl, 
  sessionId, 
  onExtractionSuccess, 
  isProcessing, 
  setIsProcessing, 
  processingMessage, 
  setProcessingMessage 
}) {
  const [extractionError, setExtractionError] = useState('')
  const [isHandwritten, setIsHandwritten] = useState(false)

  // Start text extraction
  const handleExtractText = async () => {
    if (!sessionId) {
      setExtractionError('No session found. Please upload files first.')
      return
    }

    setIsProcessing(true)
    setProcessingMessage('🔍 Reading your content... This usually takes 30-60 seconds')
    setExtractionError('')

    try {
      const response = await fetch(`${apiBaseUrl}/extract-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          is_handwritten: isHandwritten
        })
      })

      const result = await response.json()

      if (result.success) {
        setProcessingMessage('✅ Text extracted successfully!')
        setTimeout(() => {
          onExtractionSuccess(result)
        }, 1000)
      } else {
        setExtractionError(result.message || 'Failed to extract text')
      }
    } catch (error) {
      setExtractionError('Failed to extract text. Please check your connection.')
      console.error('Extraction error:', error)
    } finally {
      setIsProcessing(false)
      setProcessingMessage('')
    }
  }

  return (
    <div className="space-y-6">
      {/* OCR Method Selection */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <label className="checkbox-label">
          <input
            type="checkbox"
            className="checkbox"
            checked={isHandwritten}
            onChange={(e) => setIsHandwritten(e.target.checked)}
            disabled={isProcessing}
          />
          <div>
            <div className="font-medium">✍️ Contains handwritten text?</div>
            <div className="text-sm text-gray-600">
              Check this if your content has handwritten notes for better accuracy
            </div>
          </div>
        </label>
      </div>

      {/* Processing Status */}
      {isProcessing && (
        <div className="card">
          <div className="card-body text-center">
            <div className="spinner mx-auto mb-4" style={{ width: '32px', height: '32px' }}></div>
            <div className="text-lg font-medium mb-2">Working on it! 🤖</div>
            <div className="text-gray-600 mb-4">{processingMessage}</div>
            <div className="progress">
              <div className="progress-bar" style={{ width: '60%' }}></div>
            </div>
            <div className="text-sm text-gray-500 mt-2">
              Please wait while I carefully read each image...
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {extractionError && (
        <div className="alert alert-error">
          <div>
            <div className="font-medium">😔 Oops! Something went wrong</div>
            <div className="text-sm mt-1">{extractionError}</div>
          </div>
        </div>
      )}

      {/* Extract Button */}
      {!isProcessing && (
        <button
          onClick={handleExtractText}
          disabled={!sessionId}
          className="btn btn-primary btn-full btn-lg"
        >
          🔍 Extract Text from Images
        </button>
      )}

      {/* Tips */}
      {!isProcessing && (
        <div className="card">
          <div className="card-body">
            <h4 className="font-medium mb-3">💡 Tips for better results:</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span>📸</span>
                <span>Make sure your images are clear and well-lit</span>
              </li>
              <li className="flex items-start gap-2">
                <span>📝</span>
                <span>Check "handwritten" if your content includes handwritten notes</span>
              </li>
              <li className="flex items-start gap-2">
                <span>🔄</span>
                <span>The system will automatically choose the best OCR method</span>
              </li>
              <li className="flex items-start gap-2">
                <span>⏱️</span>
                <span>Processing usually takes 30-60 seconds depending on content</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default ProcessingIndicator