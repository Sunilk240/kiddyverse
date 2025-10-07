import { useState, useEffect } from 'react'

/**
 * FeedbackForm Component
 * 
 * A student-friendly feedback form that integrates with Formspree for collecting user feedback.
 * Features:
 * - Optional name and grade fields
 * - Star rating system with animated feedback
 * - Required feedback text area
 * - Direct submission to Formspree (no backend required)
 * - Success animation and auto-close
 * 
 * Environment Variables Required:
 * - VITE_FORMSPREE_ID: Your Formspree form ID
 */
function FeedbackForm({ isOpen, onClose }) {
  const [formData, setFormData] = useState({
    name: '',
    grade: '',
    feedback: '',
    rating: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState('')

  // Auto-scroll and focus when modal opens
  useEffect(() => {
    if (isOpen) {
      // Small delay to ensure smooth transition
      setTimeout(() => {
        // Smooth scroll to center of viewport
        const scrollTarget = Math.max(0, window.scrollY + (window.innerHeight / 2) - 300)
        window.scrollTo({
          top: scrollTarget,
          behavior: 'smooth'
        })
      }, 100)
      
      // Focus the modal for accessibility (but don't prevent body scroll)
      setTimeout(() => {
        const modal = document.querySelector('[data-feedback-modal]')
        if (modal) {
          modal.focus()
        }
      }, 400)
    }
  }, [isOpen])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!formData.feedback.trim()) {
      setError('Please share your thoughts with us!')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      const response = await fetch(`https://formspree.io/f/${import.meta.env.VITE_FORMSPREE_ID}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name || 'Anonymous Student',
          grade: formData.grade || 'Not specified',
          feedback: formData.feedback,
          rating: formData.rating || 'Not rated',
          timestamp: new Date().toISOString(),
          source: 'KiddyVerse V2.0 - Where Learning Meets Magic'
        }),
      })

      if (response.ok) {
        setIsSubmitted(true)
        // Reset form after 3 seconds
        setTimeout(() => {
          setFormData({ name: '', grade: '', feedback: '', rating: '' })
          setIsSubmitted(false)
          onClose()
        }, 3000)
      } else {
        throw new Error('Failed to submit feedback')
      }
    } catch (error) {
      console.error('Feedback submission error:', error)
      setError('Oops! Something went wrong. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-40 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-sm">
      <div 
        className="card max-w-md w-full max-h-[90vh] overflow-y-auto animate-bounce-in bg-white border border-gray-200 shadow-2xl"
        data-feedback-modal
        tabIndex="-1"
        style={{
          animation: 'modalAppear 0.4s ease-out'
        }}
      >
        {/* Header */}
        <div className="card-header text-center bg-gradient-to-r from-blue-50 to-gray-50 relative">
          <div className="text-3xl mb-3 animate-bounce">💭</div>
          <h2 className="text-2xl font-heading text-gray-800 mb-2">
            Tell Us What You Think!
          </h2>
          <p className="text-gray-600">
            Your feedback helps make KiddyVerse even better! ✨
          </p>
          
          {/* Subtle indicator that form just opened */}
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-blue-500 rounded-full animate-ping"></div>
        </div>

        <div className="card-body">
          {isSubmitted ? (
            // Success Message
            <div className="text-center py-8">
              <div className="text-4xl mb-4">🎉</div>
              <h3 className="text-xl font-heading text-gray-800 mb-3">
                Thank You So Much!
              </h3>
              <p className="text-gray-700 mb-4">
                Your feedback is super valuable to us! We'll use it to make KiddyVerse even better for students like you.
              </p>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
                You're helping make learning better for everyone! 🌟
              </div>
            </div>
          ) : (
            // Feedback Form
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name Field - Optional */}
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  👋 What's your name? (Optional)
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="Your awesome name..."
                  className="input"
                />
              </div>

              {/* Grade Field - Optional */}
              <div>
                <label htmlFor="grade" className="block text-sm font-medium text-gray-700 mb-2">
                  📚 What grade are you in? (Optional)
                </label>
                <select
                  id="grade"
                  name="grade"
                  value={formData.grade}
                  onChange={handleInputChange}
                  className="select"
                >
                  <option value="">Choose your grade...</option>
                  <option value="3">Grade 3</option>
                  <option value="4">Grade 4</option>
                  <option value="5">Grade 5</option>
                  <option value="6">Grade 6</option>
                  <option value="7">Grade 7</option>
                  <option value="8">Grade 8</option>
                  <option value="9">Grade 9</option>
                  <option value="10">Grade 10</option>
                  <option value="teacher">I'm a Teacher</option>
                  <option value="parent">I'm a Parent</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Rating Field - Optional */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  ⭐ How do you like KiddyVerse so far?
                </label>
                <div className="flex gap-2 justify-center">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, rating: star.toString() }))}
                      className={`text-2xl transition-all duration-200 hover:scale-105 ${
                        formData.rating >= star.toString() 
                          ? 'text-yellow-500' 
                          : 'text-gray-300 hover:text-yellow-400'
                      }`}
                    >
                      ⭐
                    </button>
                  ))}
                </div>
                {formData.rating && (
                  <p className="text-center text-sm text-gray-600 mt-2">
                    {formData.rating === '5' && "🎉 Awesome! You love it!"}
                    {formData.rating === '4' && "😊 Great! You really like it!"}
                    {formData.rating === '3' && "👍 Good! It's helpful!"}
                    {formData.rating === '2' && "🤔 Okay, but could be better"}
                    {formData.rating === '1' && "😔 We'll work harder to improve!"}
                  </p>
                )}
              </div>

              {/* Feedback Field - Required */}
              <div>
                <label htmlFor="feedback" className="block text-sm font-medium text-gray-700 mb-2">
                  💬 Share your thoughts! <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="feedback"
                  name="feedback"
                  value={formData.feedback}
                  onChange={handleInputChange}
                  placeholder="Tell us what you love, what could be better, or any cool ideas you have..."
                  className="textarea"
                  rows={4}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Examples: "I love how easy it is!", "Could you add more languages?", "The colors are awesome!"
                </p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="alert alert-error animate-bounce-in">
                  <div className="font-bold">😔 Oops!</div>
                  {error}
                </div>
              )}

              {/* Submit Buttons */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-outline flex-1"
                  disabled={isSubmitting}
                >
                  Maybe Later
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !formData.feedback.trim()}
                  className="btn flex-1"
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
                    color: 'white'
                  }}
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <div className="spinner"></div>
                      Sending...
                    </div>
                  ) : (
                    <>
                      <span>📝</span>
                      Send Feedback
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Close Button */}
        {!isSubmitted && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            disabled={isSubmitting}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

export default FeedbackForm