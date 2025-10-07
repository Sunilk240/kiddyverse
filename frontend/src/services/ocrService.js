import { createWorker } from 'tesseract.js';

class OCRService {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;
    
    try {
      this.worker = await createWorker('eng');
      await this.worker.setParameters({
        tessedit_pageseg_mode: '1', // Automatic page segmentation with OSD
        tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?;:()[]{}"\'-+= \n',
      });
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize OCR worker:', error);
      throw new Error('OCR initialization failed. Please try again.');
    }
  }

  async processImage(imageFile, onProgress = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Simple progress simulation since we can't use logger callbacks
      if (onProgress) {
        onProgress(10);
        setTimeout(() => onProgress(30), 500);
        setTimeout(() => onProgress(60), 1000);
        setTimeout(() => onProgress(90), 1500);
      }

      const result = await this.worker.recognize(imageFile);

      if (onProgress) {
        onProgress(100);
      }

      return {
        text: result.data.text.trim(),
        confidence: result.data.confidence,
        words: result.data.words?.length || 0
      };
    } catch (error) {
      console.error('OCR processing failed:', error);
      throw new Error('Failed to extract text from image. Please try with a clearer image.');
    }
  }

  async processMultipleImages(imageFiles, onProgress = null, onFileComplete = null) {
    const results = [];
    const totalFiles = imageFiles.length;

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      
      try {
        // Update progress for current file
        if (onProgress) {
          onProgress(Math.round((i / totalFiles) * 100), `Processing ${file.name}...`);
        }

        const result = await this.processImage(file);
        
        results.push({
          fileName: file.name,
          text: result.text,
          confidence: result.confidence,
          words: result.words,
          success: true
        });

        if (onFileComplete) {
          onFileComplete(i + 1, totalFiles, file.name);
        }

      } catch (error) {
        results.push({
          fileName: file.name,
          text: '',
          confidence: 0,
          words: 0,
          success: false,
          error: error.message
        });
      }
    }

    // Final progress update
    if (onProgress) {
      onProgress(100, 'Processing complete!');
    }

    return results;
  }

  async cleanup() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }

  // Utility method to validate image files
  validateFiles(files) {
    const errors = [];
    const validFiles = [];
    const maxFiles = 5;
    const maxSize = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/bmp'];

    if (files.length > maxFiles) {
      errors.push(`Too many files! Please select up to ${maxFiles} images only.`);
      return { validFiles: [], errors };
    }

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        errors.push(`${file.name}: Only image files (JPG, PNG, GIF, BMP) are allowed.`);
        continue;
      }

      if (file.size > maxSize) {
        errors.push(`${file.name}: File too big! Please use images smaller than 10MB.`);
        continue;
      }

      validFiles.push(file);
    }

    return { validFiles, errors };
  }
}

// Create a singleton instance
const ocrService = new OCRService();

export default ocrService;