import { useState } from 'react'
import Header from './components/Header'
import UploadSection from './components/UploadSection'
import ResultsTabs from './components/ResultsTabs'
import UserGuide from './components/UserGuide'
import Footer from './components/Footer'

function App() {
  // Application state
  const [currentStep, setCurrentStep] = useState(1) // 1: Upload, 2: Use
  const [ocrResults, setOcrResults] = useState([])
  const [extractedText, setExtractedText] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingMessage, setProcessingMessage] = useState('')
  const [showUserGuide, setShowUserGuide] = useState(false)
  const [gradeLevel, setGradeLevel] = useState('7')

  // Handle OCR processing success
  const handleUploadSuccess = (result) => {
    setOcrResults(result.results || [])
    
    // Combine all extracted text
    const combinedText = result.results
      .filter(r => r.success && r.text.trim())
      .map(r => r.text.trim())
      .join('\n\n')
    
    setExtractedText(combinedText)
    setCurrentStep(2) // Move directly to Use step
  }

  // Reset application state
  const handleReset = () => {
    setCurrentStep(1)
    setOcrResults([])
    setExtractedText('')
    setIsProcessing(false)
    setProcessingMessage('')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Header */}
      <Header 
        currentStep={currentStep}
        onShowUserGuide={() => setShowUserGuide(true)}
        gradeLevel={gradeLevel}
        onGradeLevelChange={setGradeLevel}
      />

      {/* Main Content */}
      <main className="container mx-auto">
        {/* User Guide Modal */}
        {showUserGuide && (
          <UserGuide onClose={() => setShowUserGuide(false)} />
        )}

        {/* Step 1: Upload & Process Files */}
        {currentStep === 1 && (
          <UploadSection
            onUploadSuccess={handleUploadSuccess}
            isProcessing={isProcessing}
            setIsProcessing={setIsProcessing}
            setProcessingMessage={setProcessingMessage}
          />
        )}

        {/* Step 2: Use Results */}
        {currentStep === 2 && (
          <div className="space-y-6">
            {/* OCR Results Summary */}
            <div className="card">
              <div className="card-header">
                <h2 className="text-2xl font-heading text-center">
                  🎉 Text Extracted Successfully!
                </h2>
                <p className="text-gray-600 text-center mt-2">
                  Processed {ocrResults.length} image(s). Here's what I found:
                </p>
              </div>
              <div className="card-body">
                <div className="grid gap-3 mb-4">
                  {ocrResults.map((result, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                        result.success ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                      }`}>
                        {result.success ? '✓' : '✗'}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{result.filename}</div>
                        <div className="text-sm text-gray-500">
                          {result.success 
                            ? `${result.words} words • ${Math.round(result.confidence)}% confidence`
                            : result.error || 'Processing failed'
                          }
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Results Tabs */}
            <ResultsTabs
              extractedText={extractedText}
              gradeLevel={gradeLevel}
              onReset={handleReset}
            />
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}

export default App