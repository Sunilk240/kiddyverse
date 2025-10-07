import React from 'react'

function UserGuide({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-heading">📚 How to Use Kiddyverse</h2>
            <button
              onClick={onClose}
              className="btn btn-ghost btn-sm"
            >
              ✕
            </button>
          </div>

          {/* Steps */}
          <div className="space-y-6">
            {/* Step 1 */}
            <div className="card">
              <div className="card-body">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-semibold">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">📁 Upload Your Files</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Take clear photos of your homework or textbook pages</li>
                      <li>• You can upload up to 5 images or PDF pages</li>
                      <li>• Drag and drop files or click to browse</li>
                      <li>• Check "handwritten" if your content has handwritten notes</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="card">
              <div className="card-body">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-semibold">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">🔍 Extract Text</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• I'll carefully read each image to extract all the text</li>
                      <li>• This usually takes 30-60 seconds</li>
                      <li>• I use smart AI to understand both printed and handwritten text</li>
                      <li>• The better your image quality, the better my results!</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="card">
              <div className="card-body">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-primary text-white rounded-full flex items-center justify-center font-semibold">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">✨ Use the Results</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• <strong>View Text:</strong> See all the text I found</li>
                      <li>• <strong>Get Summary:</strong> Get a summary perfect for your grade level</li>
                      <li>• <strong>Translate:</strong> Translate to any language you need</li>
                      <li>• <strong>Ask Questions:</strong> Ask me anything about the content</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Tips */}
          <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h4 className="font-semibold text-yellow-800 mb-2">💡 Tips for Best Results</h4>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• Make sure your images are clear and well-lit</li>
              <li>• Avoid blurry or rotated images</li>
              <li>• For handwritten content, check the "handwritten" option</li>
              <li>• Keep text large enough to read easily</li>
              <li>• I work best with homework, textbooks, and study materials!</li>
            </ul>
          </div>

          {/* Close Button */}
          <div className="mt-6 text-center">
            <button
              onClick={onClose}
              className="btn btn-primary"
            >
              Got it! Let's start 🚀
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserGuide