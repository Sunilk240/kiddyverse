import { useState } from 'react'

function Header({ currentStep, onShowUserGuide, gradeLevel, onGradeLevelChange }) {
  const [isAnimating, setIsAnimating] = useState(false)
  
  const steps = [
    { number: 1, title: 'Upload', icon: '📁', description: 'Add your images', color: 'from-accent-pink to-accent-orange' },
    { number: 2, title: 'Use Results', icon: '✨', description: 'Get help with your work', color: 'from-accent-green to-accent-blue' }
  ]

  const handleGradeChange = (newGrade) => {
    setIsAnimating(true)
    onGradeLevelChange(newGrade)
    setTimeout(() => setIsAnimating(false), 300)
  }

  return (
    <header className="bg-gradient-to-r from-white via-purple-50 to-pink-50 shadow-lg border-b-4 border-gradient-to-r from-primary to-accent-pink">
      <div className="container mx-auto">
        {/* Top Bar */}
        <div className="flex items-center justify-between py-4">
          {/* Logo and Title */}
          <div className="flex items-center gap-3 hover-lift">
            <div className="w-12 h-12 bg-gradient-to-br from-primary via-accent-pink to-accent-orange rounded-2xl flex items-center justify-center shadow-lg animate-float">
              <span className="text-white font-bold text-xl">🚀</span>
            </div>
            <div>
              <h1 className="text-3xl font-heading text-gradient animate-bounce-in">
                KiddyVerse
              </h1>
              <p className="text-sm text-gray-600 hidden sm:block font-medium">
                🌟 Where Learning Meets Magic!
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Grade Level Selector */}
            <div className="hidden sm:flex items-center gap-3">
              <label htmlFor="grade-select" className="text-sm font-semibold text-primary">
                📚 Grade:
              </label>
              <select
                id="grade-select"
                value={gradeLevel}
                onChange={(e) => handleGradeChange(e.target.value)}
                className={`select text-sm py-2 px-4 min-h-0 border-2 border-primary/20 hover-glow ${isAnimating ? 'animate-wiggle' : ''}`}
              >
                {[3, 4, 5, 6, 7, 8, 9, 10].map(grade => (
                  <option key={grade} value={grade.toString()}>
                    Grade {grade}
                  </option>
                ))}
              </select>
            </div>

            {/* Help Button */}
            <button
              onClick={onShowUserGuide}
              className="btn btn-fun btn-sm hover-lift"
              title="Need help? Click me!"
            >
              <span className="hidden sm:inline">🆘 Help</span>
              <span className="sm:hidden text-xl">🆘</span>
            </button>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="pb-6">
          <div className="flex items-center justify-between max-w-lg mx-auto">
            {steps.map((step, index) => (
              <div key={step.number} className="flex items-center flex-1">
                {/* Step */}
                <div className="flex flex-col items-center gap-2 hover-lift">
                  <div
                    className={`
                      w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold transition-all duration-500 hover-glow
                      ${currentStep >= step.number
                        ? `bg-gradient-to-br ${step.color} text-white shadow-xl animate-pulse-glow`
                        : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                      }
                    `}
                  >
                    {currentStep > step.number ? (
                      <span className="animate-bounce-in">🎉</span>
                    ) : (
                      <span className={currentStep === step.number ? 'animate-wiggle' : ''}>{step.icon}</span>
                    )}
                  </div>
                  <div className="text-center">
                    <div className={`text-sm font-bold ${
                      currentStep >= step.number ? 'text-gradient' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-gray-500 hidden sm:block font-medium">
                      {step.description}
                    </div>
                  </div>
                </div>

                {/* Connector */}
                {index < steps.length - 1 && (
                  <div className="flex-1 mx-4">
                    <div className={`
                      h-1 rounded-full transition-all duration-700
                      ${currentStep > step.number 
                        ? 'bg-gradient-to-r from-accent-green to-accent-blue animate-pulse-glow' 
                        : 'bg-gray-200'
                      }
                    `} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Mobile Grade Selector */}
        <div className="sm:hidden pb-4">
          <div className="flex items-center justify-center gap-3 p-3 bg-gradient-to-r from-purple-100 to-pink-100 rounded-xl">
            <label htmlFor="grade-select-mobile" className="text-sm font-bold text-primary">
              📚 Your Grade:
            </label>
            <select
              id="grade-select-mobile"
              value={gradeLevel}
              onChange={(e) => handleGradeChange(e.target.value)}
              className={`select text-sm py-2 px-4 min-h-0 border-2 border-primary/30 rounded-xl hover-glow ${isAnimating ? 'animate-wiggle' : ''}`}
            >
              {[3, 4, 5, 6, 7, 8, 9, 10].map(grade => (
                <option key={grade} value={grade.toString()}>
                  Grade {grade} 🎓
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header