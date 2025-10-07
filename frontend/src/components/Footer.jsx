
function Footer() {
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

        <div className="flex items-center justify-center gap-6 text-sm text-gray-500">
          <span>📚 Extract Text</span>
          <span>📝 Summarize</span>
          <span>🌍 Translate</span>
          <span>❓ Ask Questions</span>
        </div>

        <div className="mt-4 text-xs text-gray-400">
          Made with ❤️ for students everywhere
        </div>
      </div>
    </footer>
  )
}

export default Footer