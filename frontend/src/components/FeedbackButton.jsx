import { useState, useEffect } from 'react'
import FeedbackForm from './FeedbackForm'

function FeedbackButton() {
  const [isFormOpen, setIsFormOpen] = useState(false)

  // Listen for the custom event from footer
  useEffect(() => {
    const handleOpenFeedback = () => {
      setIsFormOpen(true)
    }

    window.addEventListener('openFeedback', handleOpenFeedback)
    return () => window.removeEventListener('openFeedback', handleOpenFeedback)
  }, [])

  return (
    <FeedbackForm 
      isOpen={isFormOpen} 
      onClose={() => setIsFormOpen(false)} 
    />
  )
}

export default FeedbackButton