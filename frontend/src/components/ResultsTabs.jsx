import { useState } from 'react'
import { apiRequest } from '../utils/api'

function ResultsTabs({ extractedText, gradeLevel, onReset }) {
  const [activeTab, setActiveTab] = useState('text')
  const [summary, setSummary] = useState('')
  const [translation, setTranslation] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('Hindi')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const tabs = [
    { id: 'text', label: 'View Text', icon: '📄', color: 'from-blue-500 to-blue-600', description: 'See extracted text' },
    { id: 'summary', label: 'Summarize', icon: '📝', color: 'from-green-500 to-green-600', description: 'Get key points' },
    { id: 'translate', label: 'Translate', icon: '🌍', color: 'from-purple-500 to-purple-600', description: 'Change language' },
    { id: 'qa', label: 'Ask Questions', icon: '❓', color: 'from-orange-500 to-orange-600', description: 'Get answers' }
  ]

  // Summarize text
  const handleSummarize = async () => {
    if (!extractedText.trim()) {
      setError('No text available to summarize')
      return
    }

    setIsLoading(true)
    setError('')
    setSummary('Creating summary...')

    try {
      const result = await apiRequest('/summarize', {
        method: 'POST',
        body: JSON.stringify({
          text: extractedText,
          classLevel: gradeLevel
        })
      })

      if (result.summary) {
        setSummary(result.summary)
      } else {
        setError('Failed to create summary')
        setSummary('')
      }
    } catch (error) {
      setError('Failed to create summary. Please check your connection.')
      setSummary('')
      console.error('Summary error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Translate text
  const handleTranslate = async () => {
    if (!extractedText.trim()) {
      setError('No text available to translate')
      return
    }

    if (!targetLanguage.trim()) {
      setError('Please enter a target language')
      return
    }

    setIsLoading(true)
    setError('')
    setTranslation('Translating...')

    try {
      const result = await apiRequest('/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: extractedText,
          targetLang: targetLanguage
        })
      })

      if (result.translations && Array.isArray(result.translations)) {
        setTranslation(result.translations.join('\n'))
      } else {
        setError('Failed to translate text')
        setTranslation('')
      }
    } catch (error) {
      setError('Failed to translate text. Please check your connection.')
      setTranslation('')
      console.error('Translation error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Ask question
  const handleAskQuestion = async () => {
    if (!extractedText.trim()) {
      setError('No text available to answer questions about')
      return
    }

    if (!question.trim()) {
      setError('Please enter a question')
      return
    }

    setIsLoading(true)
    setError('')
    setAnswer('Thinking...')

    try {
      const result = await apiRequest('/qa', {
        method: 'POST',
        body: JSON.stringify({
          text: extractedText,
          question: question.trim()
        })
      })

      if (result.answer) {
        setAnswer(result.answer)
      } else {
        setError('Failed to get an answer')
        setAnswer('')
      }
    } catch (error) {
      setError('Failed to get an answer. Please check your connection.')
      setAnswer('')
      console.error('QA error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // Copy text to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      // Could add a toast notification here
      console.log('Copied to clipboard')
    })
  }

  return (
    <div className="space-y-6">
      {/* Success Header */}
      <div className="card card-magical animate-bounce-in">
        <div className="card-header text-center bg-gradient-to-r from-green-50 to-blue-50">
          <div className="emoji-large mb-3">🎉</div>
          <h2 className="text-3xl font-heading mb-3 text-gradient">
            Awesome! I found your text!
          </h2>
          <p className="text-gray-700 text-lg font-medium">
            I extracted <span className="font-bold text-primary">{extractedText.length} characters</span> of text.
            <br />
            <span className="text-accent-green font-bold">Now choose what you want to do with it!</span>
          </p>
        </div>
      </div>

      {/* Enhanced Tabs - More Prominent */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-2xl font-heading text-center text-gradient mb-4">
            🎯 Choose Your Action!
          </h3>
          <p className="text-center text-gray-600 font-medium mb-6">
            Click on any of these awesome features to get started:
          </p>
        </div>

        <div className="card-body">
          {/* Enhanced Tab Buttons */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  relative p-4 rounded-2xl border-2 transition-all duration-300 hover-lift
                  ${activeTab === tab.id
                    ? `bg-gradient-to-br ${tab.color} text-white border-transparent shadow-xl animate-pulse-glow`
                    : 'bg-white border-gray-200 text-gray-700 hover:border-primary/50 hover:shadow-lg'
                  }
                `}
              >
                <div className="text-center">
                  <div className={`text-3xl mb-2 ${activeTab === tab.id ? 'animate-bounce' : ''}`}>
                    {tab.icon}
                  </div>
                  <div className="font-bold text-sm mb-1">
                    {tab.label}
                  </div>
                  <div className={`text-xs ${activeTab === tab.id ? 'text-white/80' : 'text-gray-500'}`}>
                    {tab.description}
                  </div>
                </div>

                {activeTab === tab.id && (
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center animate-bounce">
                    <span className="text-xs">✨</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-2xl p-6 min-h-[300px]">
            {/* Extracted Text Tab */}
            {activeTab === 'text' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">📄 Extracted Text</h3>
                  <button
                    onClick={() => copyToClipboard(extractedText)}
                    className="btn btn-outline btn-sm"
                  >
                    📋 Copy
                  </button>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-sm">
                    {extractedText || 'No text extracted yet.'}
                  </pre>
                </div>
              </div>
            )}

            {/* Summary Tab */}
            {activeTab === 'summary' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">📝 Summary for Grade {gradeLevel}</h3>
                  <button
                    onClick={handleSummarize}
                    disabled={isLoading || !extractedText.trim()}
                    className="btn btn-primary btn-sm"
                  >
                    {isLoading ? 'Creating...' : '✨ Summarize'}
                  </button>
                </div>

                {summary && (
                  <div className="space-y-3">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="whitespace-pre-wrap text-sm">
                        {summary}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(summary)}
                      className="btn btn-outline btn-sm"
                    >
                      📋 Copy Summary
                    </button>
                  </div>
                )}

                {!summary && !isLoading && (
                  <div className="text-center py-8 text-gray-500">
                    Click "Summarize" to get a grade-appropriate summary of your content
                  </div>
                )}
              </div>
            )}

            {/* Translation Tab */}
            {activeTab === 'translate' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">🌍 Translate Text</h3>

                <div className="flex gap-3">
                  <input
                    type="text"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    placeholder="Enter target language (e.g., Hindi, Spanish)"
                    className="input flex-1"
                  />
                  <button
                    onClick={handleTranslate}
                    disabled={isLoading || !extractedText.trim() || !targetLanguage.trim()}
                    className="btn btn-primary"
                  >
                    {isLoading ? 'Translating...' : '🔄 Translate'}
                  </button>
                </div>

                {translation && (
                  <div className="space-y-3">
                    <div className="p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                      <div className="whitespace-pre-wrap text-sm">
                        {translation}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(translation)}
                      className="btn btn-outline btn-sm"
                    >
                      📋 Copy Translation
                    </button>
                  </div>
                )}

                {!translation && !isLoading && (
                  <div className="text-center py-8 text-gray-500">
                    Enter a language and click "Translate" to translate your content
                  </div>
                )}
              </div>
            )}

            {/* Q&A Tab */}
            {activeTab === 'qa' && (
              <div className="space-y-4">
                <h3 className="text-lg font-medium">❓ Ask Questions</h3>

                <div className="space-y-3">
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="Ask a question about your content..."
                    className="textarea"
                    rows={3}
                  />
                  <button
                    onClick={handleAskQuestion}
                    disabled={isLoading || !extractedText.trim() || !question.trim()}
                    className="btn btn-primary btn-full"
                  >
                    {isLoading ? 'Thinking...' : '🤔 Get Answer'}
                  </button>
                </div>

                {answer && (
                  <div className="space-y-3">
                    <h4 className="font-medium">💡 Answer:</h4>
                    <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded-lg">
                      <div className="whitespace-pre-wrap text-sm">
                        {answer}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(answer)}
                      className="btn btn-outline btn-sm"
                    >
                      📋 Copy Answer
                    </button>
                  </div>
                )}

                {!answer && !isLoading && (
                  <div className="text-center py-8 text-gray-500">
                    Ask any question about your content and I'll answer based on what I found
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="alert alert-error animate-bounce-in">
          <div className="font-bold">😔 Oops!</div>
          {error}
        </div>
      )}

      {/* Reset Button - Less Prominent */}
      <div className="text-center pt-8">
        <button
          onClick={onReset}
          className="btn btn-ghost btn-sm text-gray-500 hover:text-gray-700"
        >
          🔄 Start Over
        </button>
        <p className="text-xs text-gray-400 mt-2">
          Want to upload different files? Click above
        </p>
      </div>
    </div>
  )
}

export default ResultsTabs