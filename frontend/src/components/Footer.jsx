
import { useState } from 'react'

function Footer() {
  const [isClicked, setIsClicked] = useState(false)

  const handleFeedbackClick = () => {
    setIsClicked(true)
    window.dispatchEvent(new CustomEvent('openFeedback'))
    
    // Reset the clicked state after animation
    setTimeout(() => setIsClicked(false), 1000)
  }
  return (
    <footer className="mt-16 py-8 border-t border-gray-200 bg-white">
      <div className="container mx-auto text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gradient-to-br from-primary to-secondary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <span className="text-lg font-heading bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            Kiddyverse V2.0
          </span>
        </div>

        <p className="text-gray-600 text-sm mb-4">
          Your AI-powered learning assistant for grades 3-10
        </p>

        <div className="flex items-center justify-center gap-6 text-sm text-gray-500 mb-3">
          <span>📚 Extract Text</span>
          <span>📝 Summarize</span>
          <span>🌍 Translate</span>
          <span>❓ Ask Questions</span>
        </div>

        <div className="text-xs text-gray-400 mb-3">
          Made with ❤️ for students everywhere
        </div>

        <div className="flex items-center justify-center gap-3 text-xs text-gray-400">
          <span>💭 Have feedback?</span>
          <button
            onClick={handleFeedbackClick}
            className={`text-primary hover:text-secondary transition-all duration-300 font-medium underline ${
              isClicked ? 'scale-110 text-secondary' : ''
            }`}
          >
            {isClicked ? '✨ Opening feedback form...' : 'Share your thoughts'}
          </button>
        </div>
      </div>
    </footer>
  )
}

export default Footer