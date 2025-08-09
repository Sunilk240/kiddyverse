import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();

app.use(express.json({ limit: '2mb' }));

// CORS
const allowedOrigin = process.env.ALLOWED_ORIGIN;
app.use(
  cors({
    origin: allowedOrigin ? [allowedOrigin] : true,
    credentials: false,
  })
);

// Rate limit
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_RPM || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health
app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Uploads
const upload = multer({ storage: multer.memoryStorage() });

// Gemini
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  console.warn('GEMINI_API_KEY is not set. OCR/summarize/translate/qa will fail until configured.');
}
const genAI = new GoogleGenerativeAI(geminiApiKey || '');

function splitIntoLinesPreservingStructure(text) {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

// OCR (Gemini multimodal)
app.post('/ocr/gemini', upload.array('images', 10), async (req, res) => {
  try {
    if (!geminiApiKey) return res.status(500).json({ error: 'Server not configured for Gemini OCR' });
    const files = req.files || [];
    if (files.length === 0) return res.status(400).json({ error: 'No images uploaded' });

    const modelName = process.env.MODEL_OCR || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    const parts = [{ text: 'Extract all readable text from the image(s). Do not summarize. Return plain text only.' }];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      parts.push({ inlineData: { mimeType: file.mimetype, data: file.buffer.toString('base64') } });
      if (i < files.length - 1) parts.push({ text: `\n\n=== Image ${i + 1} End ===\n\n` });
    }

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const response = await result.response;
    const text = response.text();
    res.json({ lines: splitIntoLinesPreservingStructure(text) });
  } catch (err) {
    console.error('OCR error:', err);
    res.status(500).json({ error: 'OCR failed', details: err?.message || String(err) });
  }
});

// Summarize (class-based)
app.post('/summarize', async (req, res) => {
  try {
    if (!geminiApiKey) return res.status(500).json({ error: 'Server not configured for Gemini' });
    const { text, classLevel, ageLevel } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Missing required field: text' });

    const modelName = process.env.MODEL_SUMMARIZE || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    function classGuidance(level) {
      const n = parseInt(String(level || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(n)) {
        if (ageLevel) {
          switch ((ageLevel || '').toString()) {
            case '6-8': return 'Very simple language. Short sentences. Explain hard words.';
            case '9-12': return 'Simple language with examples. Avoid jargon.';
            case '13-15': return 'Cover all main ideas with clear structure; light academic terms.';
            default: return 'Well-structured explanation covering all sections with nuance.';
          }
        }
        return 'Simple, clear language appropriate for middle school.';
      }
      if (n <= 5) return 'Very simple language for Class 3–5. Short sentences. Define hard words. Use everyday examples.';
      if (n <= 8) return 'Simple language for Class 6–8. Explain all key ideas in order. Define important terms briefly. Avoid heavy jargon.';
      if (n <= 10) return 'Clear academic tone for Class 9–10. Explain causes, effects, and key arguments in order. Keep language approachable.';
      return 'Structured explanation for Class 11–12. Preserve nuance, cover every section in order, and keep language accessible.';
    }

    const audienceGuidance = classGuidance(classLevel);

    const prompt = `You are a careful summarizer for school students. Explain the ENTIRE passage in simple words, covering all key ideas in the same order as the text. Do not add external facts or assumptions. If something is unclear in the passage, say so briefly rather than guessing.

Audience and style guidance: ${audienceGuidance}

Formatting guidance:
- Use short paragraphs (and bullet points only if they improve clarity).
- Define difficult terms briefly when they first appear.
- Keep the explanation comprehensive, not just a brief abstract.

Return only the summary.

--- TEXT START ---
${text}
--- TEXT END ---`;

    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const response = await result.response;
    res.json({ summary: response.text() });
  } catch (err) {
    console.error('Summarization error:', err);
    res.status(500).json({ error: 'Summarization failed', details: err?.message || String(err) });
  }
});

// Translate – keep structure
app.post('/translate', async (req, res) => {
  try {
    if (!geminiApiKey) return res.status(500).json({ error: 'Server not configured for Gemini' });
    const { lines, text, sourceLang, targetLang } = req.body || {};
    if (!targetLang || typeof targetLang !== 'string') return res.status(400).json({ error: 'Missing required field: targetLang' });

    let inputLines;
    if (Array.isArray(lines) && lines.length) {
      inputLines = lines.map((l) => (typeof l === 'string' ? l : String(l)));
    } else if (typeof text === 'string' && text.trim().length > 0) {
      inputLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    } else {
      return res.status(400).json({ error: 'Provide either lines[] or text' });
    }

    const modelName = process.env.MODEL_TRANSLATE || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });

    const src = sourceLang && String(sourceLang).trim().length ? `from ${sourceLang}` : 'from the source language (auto-detect)';
    const sys = `Translate each input line ${src} to ${targetLang}. Do not summarize or omit any information. Preserve punctuation, numbers, names, and formatting. Return plain text only with the exact same number of lines as the input (1 output line per input line, in the same order). Do not add quotes or bullets.`;

    const result = await model.generateContent({ contents: [
      { role: 'user', parts: [{ text: sys }] },
      { role: 'user', parts: [{ text: inputLines.join('\n') }] },
    ]});
    const response = await result.response;
    const translatedText = response.text();
    const translatedLines = translatedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    if (translatedLines.length < inputLines.length) {
      while (translatedLines.length < inputLines.length) translatedLines.push('');
    } else if (translatedLines.length > inputLines.length) {
      const extras = translatedLines.splice(inputLines.length - 1);
      translatedLines[inputLines.length - 1] = [translatedLines[inputLines.length - 1], ...extras].join(' ');
    }

    res.json({ translations: translatedLines });
  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ error: 'Translation failed', details: err?.message || String(err) });
  }
});

// Q&A – strict context only
app.post('/qa', async (req, res) => {
  try {
    if (!geminiApiKey) return res.status(500).json({ error: 'Server not configured for Gemini' });
    const { question, text, lines } = req.body || {};
    if (!question || typeof question !== 'string') return res.status(400).json({ error: 'Missing required field: question' });

    let context = '';
    if (Array.isArray(lines) && lines.length) context = lines.map((l) => (typeof l === 'string' ? l : String(l))).join('\n');
    else if (typeof text === 'string' && text.trim().length > 0) context = text;
    else return res.status(400).json({ error: 'Provide either lines[] or text' });

    const maxChars = parseInt(process.env.QA_MAX_CHARS || '24000', 10);
    if (context.length > maxChars) {
      const head = context.slice(0, Math.floor(maxChars * 0.6));
      const tail = context.slice(-Math.floor(maxChars * 0.4));
      context = `${head}\n\n...\n\n${tail}`;
    }

    const modelName = process.env.MODEL_QA || 'gemini-1.5-flash';
    const model = genAI.getGenerativeModel({ model: modelName });
    const prompt = `You are a strict extraction-based QA assistant. Use ONLY the provided CONTEXT to answer. If the answer is not explicitly contained in the context, reply exactly with: "I don't know based on the passage." Do not add any outside knowledge. Return only the answer text.\n\nCONTEXT:\n${context}\n\nQUESTION: ${question}`;

    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    const response = await result.response;
    res.json({ answer: (response.text() || '').trim() });
  } catch (err) {
    console.error('QA error:', err);
    res.status(500).json({ error: 'QA failed', details: err?.message || String(err) });
  }
});

const port = parseInt(process.env.PORT || '8080', 10);
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

