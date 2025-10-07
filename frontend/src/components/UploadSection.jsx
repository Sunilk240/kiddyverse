import { useState, useRef } from 'react'
import ocrService from '../services/ocrService'
import { getApiUrl } from '../utils/api'

function UploadSection({ onUploadSuccess, isProcessing, setIsProcessing, setProcessingMessage }) {
    const [selectedFiles, setSelectedFiles] = useState([])
    const [dragOver, setDragOver] = useState(false)
    const [isHandwritten, setIsHandwritten] = useState(false)
    const [uploadError, setUploadError] = useState('')
    const [processingMessage, setLocalProcessingMessage] = useState('')
    const fileInputRef = useRef(null)

    // Update processing message both locally and in parent
    const updateProcessingMessage = (message) => {
        setLocalProcessingMessage(message)
        if (setProcessingMessage) {
            setProcessingMessage(message)
        }
    }

    // Handle file selection
    const handleFileSelect = (files) => {
        const { validFiles, errors } = ocrService.validateFiles(Array.from(files))
        
        if (errors.length > 0) {
            setUploadError(errors.join('\n'))
            return
        }
        
        setSelectedFiles(validFiles)
        setUploadError('')
    }

    // Handle drag and drop
    const handleDragOver = (e) => {
        e.preventDefault()
        setDragOver(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        setDragOver(false)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const files = e.dataTransfer.files
        handleFileSelect(files)
    }

    // Handle file input change
    const handleFileInputChange = (e) => {
        handleFileSelect(e.target.files)
    }

    // Process files with smart OCR method selection
    const handleUpload = async () => {
        if (selectedFiles.length === 0) {
            setUploadError('Please select some files first!')
            return
        }

        setIsProcessing(true)
        setUploadError('')

        try {
            if (isHandwritten) {
                // Use backend Gemini for handwritten text
                updateProcessingMessage('Using advanced AI for handwritten text...')
                await processWithBackend()
            } else {
                // Use frontend Tesseract.js for printed text (offline)
                updateProcessingMessage('Processing with offline OCR...')
                await processWithFrontend()
            }
            
        } catch (error) {
            setUploadError('OCR processing failed. Please try again with clearer images.')
            console.error('OCR error:', error)
        } finally {
            setIsProcessing(false)
            setTimeout(() => updateProcessingMessage(''), 2000)
        }
    }

    // Frontend processing with Tesseract.js (with Gemini fallback)
    const processWithFrontend = async () => {
        try {
            // Initialize OCR service
            await ocrService.initialize()
            
            // Process files with progress tracking
            const results = await ocrService.processMultipleImages(
                selectedFiles,
                (progress, message) => {
                    updateProcessingMessage(message || `Processing offline... ${progress}%`)
                },
                (completed, total, fileName) => {
                    updateProcessingMessage(`Completed ${completed}/${total}: ${fileName}`)
                }
            )

            // Check if any files failed and need Gemini fallback
            const failedFiles = results.filter(r => !r.success)
            let finalResults = [...results]

            if (failedFiles.length > 0) {
                updateProcessingMessage(`Retrying ${failedFiles.length} failed files with AI...`)
                
                try {
                    // Get the original files that failed
                    const failedOriginalFiles = failedFiles.map(failed => 
                        selectedFiles.find(file => file.name === failed.fileName)
                    ).filter(Boolean)

                    if (failedOriginalFiles.length > 0) {
                        // Process failed files with backend Gemini
                        const geminiResults = await processFailedFilesWithGemini(failedOriginalFiles)
                        
                        // Replace failed results with Gemini results
                        finalResults = results.map(result => {
                            if (!result.success) {
                                const geminiResult = geminiResults.find(gr => gr.filename === result.fileName)
                                if (geminiResult && geminiResult.success) {
                                    return {
                                        fileName: geminiResult.filename,
                                        text: geminiResult.text,
                                        confidence: geminiResult.confidence,
                                        words: geminiResult.words,
                                        success: geminiResult.success,
                                        error: null
                                    }
                                }
                            }
                            return result
                        })
                    }
                } catch (geminiError) {
                    console.warn('Gemini fallback failed:', geminiError)
                    // Continue with original results if Gemini fallback fails
                }
            }

            // Format results for the app
            const processedResults = {
                success: true,
                results: finalResults.map(result => ({
                    filename: result.fileName,
                    text: result.text,
                    confidence: result.confidence,
                    words: result.words,
                    success: result.success,
                    error: result.error
                })),
                message: `Successfully processed ${finalResults.filter(r => r.success).length} out of ${finalResults.length} files`
            }

            updateProcessingMessage('Processing complete! 🎉')
            onUploadSuccess(processedResults)

        } catch (error) {
            // If Tesseract completely fails, try all files with Gemini
            updateProcessingMessage('Offline processing failed, trying with AI...')
            await processWithBackend()
        }
    }

    // Helper function to process failed files with Gemini
    const processFailedFilesWithGemini = async (failedFiles) => {
        
        // Upload failed files to backend
        const formData = new FormData()
        failedFiles.forEach(file => {
            formData.append('files', file)
        })

        const uploadResponse = await fetch(getApiUrl('/upload-files'), {
            method: 'POST',
            body: formData
        })

        const uploadResult = await uploadResponse.json()
        
        if (!uploadResult.success) {
            throw new Error('Failed to upload files for Gemini fallback')
        }

        // Process with Gemini OCR
        const ocrResponse = await fetch(getApiUrl('/extract-text'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: uploadResult.session_id,
                is_handwritten: false // Fallback for printed text
            })
        })

        const ocrResult = await ocrResponse.json()
        
        if (!ocrResult.success) {
            throw new Error('Gemini fallback processing failed')
        }

        // Return formatted results
        return ocrResult.individual_results?.map(result => ({
            filename: result.filename,
            text: result.extracted_text,
            confidence: result.confidence_score,
            words: result.extracted_text.split(' ').length,
            success: !result.error_message,
            error: result.error_message
        })) || []
    }

    // Backend processing with Gemini for handwritten text
    const processWithBackend = async () => {
        // Upload files to backend
        updateProcessingMessage('Uploading files for AI processing...')
        const formData = new FormData()
        selectedFiles.forEach(file => {
            formData.append('files', file)
        })

        const uploadResponse = await fetch(getApiUrl('/upload-files'), {
            method: 'POST',
            body: formData
        })

        const uploadResult = await uploadResponse.json()
        
        if (!uploadResult.success) {
            throw new Error(uploadResult.message || 'Upload failed')
        }

        // Process with OCR
        updateProcessingMessage('AI is reading your handwritten text...')
        const ocrResponse = await fetch(getApiUrl('/extract-text'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: uploadResult.session_id,
                is_handwritten: true
            })
        })

        const ocrResult = await ocrResponse.json()
        
        if (!ocrResult.success) {
            throw new Error(ocrResult.message || 'OCR processing failed')
        }

        // Format results for the app
        const processedResults = {
            success: true,
            results: ocrResult.individual_results?.map(result => ({
                filename: result.filename,
                text: result.extracted_text,
                confidence: result.confidence_score,
                words: result.extracted_text.split(' ').length,
                success: !result.error_message,
                error: result.error_message
            })) || [],
            message: `Successfully processed with AI for handwritten text`
        }

        updateProcessingMessage('AI processing complete! 🎉')
        onUploadSuccess(processedResults)
    }

    // Remove a file from selection
    const removeFile = (index) => {
        const newFiles = selectedFiles.filter((_, i) => i !== index)
        setSelectedFiles(newFiles)
    }

    // Clear all files
    const clearFiles = () => {
        setSelectedFiles([])
        setUploadError('')
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    return (
        <div className="space-y-6">
            {/* Welcome Card */}
            <div className="card card-magical animate-bounce-in">
                <div className="card-header text-center bg-pattern-dots">
                    <div className="emoji-large mb-4">🚀</div>
                    <h2 className="text-4xl font-heading mb-4 text-gradient animate-float">
                        Welcome to KiddyVerse!
                    </h2>
                    <div className="text-gray-700 text-lg leading-relaxed">
                        <p className="mb-4">
                            <span className="font-semibold">📚 Upload your homework images</span>, and I'll help you extract text,
                            get summaries, translations, and answer questions!
                        </p>
                        <div className="mt-4 p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl">
                            <span className="text-sm font-bold text-primary block mb-1">
                                🎯 Choose Your Processing Method:
                            </span>
                            <span className="text-sm font-medium text-accent-green">
                                ⚡ Printed text: Super fast offline processing
                            </span>
                            <span className="text-sm font-medium text-accent-blue block">
                                ✍️ Handwritten: Advanced AI magic
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* File Upload Card */}
            <div className="card hover-lift">
                <div className="card-header bg-gradient-to-r from-blue-50 to-purple-50">
                    <div className="flex items-center gap-3">
                        <span className="emoji-large">📁</span>
                        <div>
                            <h3 className="text-2xl font-heading text-gradient">Upload Your Files</h3>
                            <p className="text-gray-600 mt-1 font-medium">
                                🎯 I can read up to 5 images at a time (works offline too!)
                            </p>
                        </div>
                    </div>
                </div>

                <div className="card-body">
                    {/* File Drop Zone */}
                    <div
                        className={`file-upload ${dragOver ? 'dragover' : ''}`}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*"
                            onChange={handleFileInputChange}
                            className="hidden"
                        />

                        <div className="text-center">
                            <div className="emoji-large mb-4">📎</div>
                            <div className="text-xl font-bold text-gray-800 mb-3">
                                🎯 Drop your files here or click to browse!
                            </div>
                            <div className="text-sm text-gray-600 font-medium bg-white/50 rounded-lg p-2">
                                📸 Supports: JPG, PNG, GIF, BMP • Max 5 files • 10MB each
                            </div>
                            <div className="mt-3 text-xs text-gray-500">
                                ✨ Drag and drop is super fun!
                            </div>
                        </div>
                    </div>

                    {/* Smart OCR Method Selection */}
                    <div className="mt-6 p-5 bg-gradient-to-r from-purple-50 via-pink-50 to-orange-50 border-2 border-purple-200 rounded-2xl hover-glow interactive-hover">
                        <label className="checkbox-label cursor-pointer">
                            <input
                                type="checkbox"
                                className="checkbox w-6 h-6 accent-primary"
                                checked={isHandwritten}
                                onChange={(e) => setIsHandwritten(e.target.checked)}
                            />
                            <div className="ml-2">
                                <div className="font-bold text-lg flex items-center gap-2">
                                    <span className="emoji-bounce">✍️</span>
                                    Contains handwritten text?
                                </div>
                                <div className="text-sm mt-2 p-3 rounded-xl font-medium">
                                    {isHandwritten ? (
                                        <div className="bg-blue-100 text-blue-800 rounded-lg p-3">
                                            <span className="font-bold">🤖 AI Magic Mode!</span>
                                            <br />
                                            Will use advanced AI (needs internet) - Perfect for handwritten notes, drawings with text
                                        </div>
                                    ) : (
                                        <div className="bg-green-100 text-green-800 rounded-lg p-3">
                                            <span className="font-bold">⚡ Lightning Fast Mode!</span>
                                            <br />
                                            Will use super-fast offline processing - Perfect for printed text, books, documents
                                        </div>
                                    )}
                                </div>
                            </div>
                        </label>
                    </div>

                    {/* Selected Files */}
                    {selectedFiles.length > 0 && (
                        <div className="mt-6">
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="font-medium">Selected Files ({selectedFiles.length})</h4>
                                <button
                                    onClick={clearFiles}
                                    className="btn btn-ghost btn-sm"
                                    disabled={isProcessing}
                                >
                                    Clear All
                                </button>
                            </div>

                            <div className="space-y-2">
                                {selectedFiles.map((file, index) => (
                                    <div key={index} className="flex items-center gap-3 p-3 bg-white border rounded-lg">
                                        <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center text-sm font-semibold">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{file.name}</div>
                                            <div className="text-sm text-gray-500">
                                                {(file.size / (1024 * 1024)).toFixed(1)} MB
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => removeFile(index)}
                                            className="btn btn-ghost btn-sm text-error"
                                            disabled={isProcessing}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {uploadError && (
                        <div className="alert alert-error mt-4">
                            {uploadError}
                        </div>
                    )}

                    {/* Processing Message */}
                    {isProcessing && (
                        <div className="alert alert-info mt-4 animate-bounce-in">
                            <div className="flex items-center gap-3">
                                <div className="spinner-magical"></div>
                                <div>
                                    <div className="font-bold text-primary">🎯 Working on your files...</div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        {processingMessage || "Getting everything ready for you!"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Upload Button */}
                    <div className="mt-8">
                        <button
                            onClick={handleUpload}
                            disabled={selectedFiles.length === 0 || isProcessing}
                            className="btn btn-primary btn-full btn-lg hover-lift animate-pulse-glow"
                        >
                            {isProcessing ? (
                                <div className="loading-message">
                                    <div className="spinner-magical"></div>
                                    <span>Processing your awesome files...</span>
                                </div>
                            ) : (
                                <>
                                    <span className="emoji-large mr-2">🚀</span>
                                    <span className="font-bold">
                                        {selectedFiles.length > 0 
                                            ? `Process ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''} Now!` 
                                            : 'Ready to Upload Files!'
                                        }
                                    </span>
                                    <span className="emoji-large ml-2">✨</span>
                                </>
                            )}
                        </button>
                        {selectedFiles.length > 0 && !isProcessing && (
                            <div className="text-center mt-3">
                                <div className="encouragement">
                                    Great job selecting your files! Click the button above to start the magic! 🎉
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default UploadSection