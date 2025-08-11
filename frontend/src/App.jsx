import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
import { useForm, ValidationError } from '@formspree/react';
import * as pdfjsLib from 'pdfjs-dist/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

function toLines(text) {
  if (!text) return [];
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

async function resizeImageFile(file, maxDim = 2000) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      const scale = Math.min(1, maxDim / Math.max(width, height));
      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: file.type || 'image/png' }));
        }, file.type || 'image/png', 0.92);
      } else { resolve(file); }
    };
    img.src = URL.createObjectURL(file);
  });
}

function guessLangCode(name) {
  if (!name) return undefined;
  const s = name.toLowerCase();
  if (s.startsWith('hin') || s.includes('hindi')) return 'hi-IN';
  if (s.startsWith('eng') || s.includes('english')) return 'en-US';
  if (s.startsWith('spa') || s.includes('spanish')) return 'es-ES';
  if (s.startsWith('fra') || s.includes('french')) return 'fr-FR';
  if (s.startsWith('deu') || s.includes('german')) return 'de-DE';
  return undefined;
}

function speak(text, langName) {
  if (!('speechSynthesis' in window)) { alert('SpeechSynthesis not supported'); return; }
  const utter = new SpeechSynthesisUtterance(String(text || '').slice(0, 10000));
  const langCode = guessLangCode(langName);
  if (langCode) utter.lang = langCode;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utter);
}

function downloadTextFile(filename, text) {
  const blob = new Blob([String(text || '')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'translation.txt';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadPdfFromText(title, text) {
  const safeTitle = String(title || 'Translation');
  const safeBody = String(text || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const html = `<!doctype html><html><head><meta charset="utf-8"/>
  <title>${safeTitle}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Noto Sans", "Noto Sans Devanagari", sans-serif; margin: 32px; }
    h1 { font-size: 18px; margin: 0 0 12px; }
    pre { white-space: pre-wrap; word-wrap: break-word; font-family: inherit; }
    @page { size: A4; margin: 20mm; }
  </style></head><body>
  <h1>${safeTitle}</h1>
  <pre>${safeBody}</pre>
  <script>window.onload = () => { window.print(); }<\/script>
  </body></html>`;
  const w = window.open('', '_blank');
  if (!w) { alert('Popup blocked. Allow popups to download PDF.'); return; }
  w.document.open('text/html'); w.document.write(html); w.document.close();
}

export default function App() {
  const defaultApiBase = (import.meta.env && import.meta.env.VITE_API_BASE_URL) ? import.meta.env.VITE_API_BASE_URL : 'http://localhost:8080';
  const [endpoint, setEndpoint] = useLocalStorage('endpoint', defaultApiBase);
  const [mode, setMode] = useLocalStorage('mode', 'auto'); // auto | tesseract | gemini
  const [lang, setLang] = useLocalStorage('lang', 'eng');
  const [threshold, setThreshold] = useLocalStorage('threshold', 75);
  const maxPdfMBRaw = (import.meta.env && import.meta.env.VITE_MAX_PDF_MB) ? parseFloat(import.meta.env.VITE_MAX_PDF_MB) : 10;
  const maxPdfMB = Number.isFinite(maxPdfMBRaw) && maxPdfMBRaw > 0 ? maxPdfMBRaw : 10;
  const maxPdfBytes = maxPdfMB * 1024 * 1024;

  // Feedback (Formspree)
  const formspreeId = (import.meta.env && import.meta.env.VITE_FORMSPREE_ID) ? import.meta.env.VITE_FORMSPREE_ID : '';
  const formspreeEndpoint = formspreeId ? `https://formspree.io/f/${formspreeId}` : '';
  const [fsState, fsHandleSubmit] = useForm(formspreeId || 'placeholder');

  const [files, setFiles] = useState([]);
  const [currentSessionId, setCurrentSessionId] = useLocalStorage('currentSessionId', '');
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [progLabel, setProgLabel] = useState('');
  const [combinedLines, setCombinedLines] = useLocalStorage('ocrCombinedLines', []);
  const [ocrReady, setOcrReady] = useState(false);
  const [activeTab, setActiveTab] = useState(null); // 'ocr' | 'summarize' | 'qa' | 'translate'
  const [isProcessing, setIsProcessing] = useState(false);

  const [summary, setSummary] = useLocalStorage('summary', '');
  const [classLevel, setClassLevel] = useLocalStorage('classLevel', '7');

  const [translations, setTranslations] = useLocalStorage('translations', []);
  const [targetLang, setTargetLang] = useLocalStorage('targetLang', 'Hindi');

  const [question, setQuestion] = useLocalStorage('question', '');
  const [answer, setAnswer] = useLocalStorage('answer', '');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  // Session archiving helpers (logical folders in localStorage)
  function generateTimestampSlug(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }

  function readJsonSafe(key, fallback) {
    try { const t = localStorage.getItem(key); return t ? JSON.parse(t) : fallback; } catch { return fallback; }
  }

  function writeJsonSafe(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function createNewSessionFromFiles(inputFiles) {
    const firstName = (inputFiles[0] && inputFiles[0].name) ? inputFiles[0].name : 'files';
    const base = String(firstName).replace(/\.[^.]+$/, '');
    const sessionSummaryKey = 'sessions';
    const sessions = readJsonSafe(sessionSummaryKey, []);
    const existingIds = new Set((sessions || []).map((s) => s.id));

    // Find a unique id: base, base 2, base 3, ...
    let id = base;
    if (existingIds.has(id)) {
      let suffix = 2;
      while (existingIds.has(`${base} ${suffix}`)) suffix += 1;
      id = `${base} ${suffix}`;
    }

    // Build metadata for uploaded files
    const filesMeta = [];
    for (const f of inputFiles) {
      const isImage = f && f.type && f.type.startsWith('image/');
      const preview = isImage ? await fileToDataUrl(f) : null;
      filesMeta.push({ name: f.name, type: f.type || '', size: f.size || 0, preview });
    }

    const nowIso = new Date().toISOString();
    const sessionObj = { id, title: id, timestamp: nowIso, files: filesMeta, results: { ocr: '', summarize: '', translations: [], qa: [] } };
    const newSessions = [{ id, title: id, timestamp: nowIso }, ...sessions].slice(0, 50);
    writeJsonSafe(sessionSummaryKey, newSessions);
    writeJsonSafe(`session:${id}`, sessionObj);
    setCurrentSessionId(id);
    return id;
  }

  function updateSessionResult(partial) {
    const id = currentSessionId;
    if (!id) return;
    const key = `session:${id}`;
    const sess = readJsonSafe(key, null);
    if (!sess || !sess.results) return;
    const newResults = { ...sess.results };
    if (partial.ocr !== undefined) newResults.ocr = partial.ocr || '';
    if (partial.summarize !== undefined) newResults.summarize = partial.summarize || '';
    if (partial.translations !== undefined) newResults.translations = Array.isArray(partial.translations) ? partial.translations : [];
    const merged = { ...sess, results: newResults };
    writeJsonSafe(key, merged);
  }

  function appendSessionQa(questionText, answerText) {
    const id = currentSessionId;
    if (!id) return;
    const key = `session:${id}`;
    const sess = readJsonSafe(key, null);
    if (!sess || !sess.results) return;
    const qa = Array.isArray(sess.results.qa) ? sess.results.qa.slice() : [];
    qa.push({ q: questionText, a: answerText, at: new Date().toISOString() });
    const merged = { ...sess, results: { ...sess.results, qa } };
    writeJsonSafe(key, merged);
  }

  const [feedbackName, setFeedbackName] = useLocalStorage('feedbackName', '');
  const [feedbackFeature, setFeedbackFeature] = useLocalStorage('feedbackFeature', '');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  const combinedText = useMemo(() => (Array.isArray(combinedLines) ? combinedLines.join('\n') : ''), [combinedLines]);

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    const tooLarge = picked.filter((f) => f && f.type === 'application/pdf' && typeof f.size === 'number' && f.size > maxPdfBytes);
    if (tooLarge.length) {
      const names = tooLarge.map((f) => `${f.name} (${(f.size / (1024*1024)).toFixed(1)} MB)`).join(', ');
      alert(`Some PDFs exceed the maximum size of ${maxPdfMB} MB and were ignored: ${names}`);
    }
    const accepted = picked.filter((f) => !(f && f.type === 'application/pdf' && typeof f.size === 'number' && f.size > maxPdfBytes));
    setFiles(accepted);
  };

  const runServerOCRSingle = useCallback(async (file) => {
    const url = `${endpoint.replace(/\/$/, '')}/ocr/gemini`;
    const form = new FormData();
    form.append('images', file, file.name);
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) { const text = await res.text(); throw new Error(`Server OCR failed (${res.status}): ${text}`); }
    return res.json();
  }, [endpoint]);

  // Note: PDF pages are rendered client-side and sent as images via runServerOCRSingle

  const tesseractRecognizeSingle = useCallback(async (file, langCode) => {
    const { data } = await Tesseract.recognize(file, langCode, {
      logger: (m) => {
        if (m && typeof m.progress === 'number') {
          setProgress(m.progress);
          setProgLabel(`${Math.round(m.progress * 100)}% - ${m.status}`);
        }
      },
    });
    const meanConfidence = typeof data.confidence === 'number'
      ? data.confidence
      : (Array.isArray(data.words) && data.words.length
        ? (data.words.reduce((s, w) => s + (w.confidence || 0), 0) / data.words.length)
        : 0);
    return { text: data.text || '', confidence: meanConfidence };
  }, []);

  const needsFallback = (confidence, text, th) => {
    const minChars = 40;
    if ((confidence || 0) < th) return true;
    if (!text || text.replace(/\s+/g, '').length < minChars) return true;
    return false;
  };

  const runOCR = async () => {
    if (!files.length) { alert('Please add images or PDFs first.'); return; }
    const oversizedPdfs = files.filter((f) => f && f.type === 'application/pdf' && typeof f.size === 'number' && f.size > maxPdfBytes);
    if (oversizedPdfs.length) {
      const names = oversizedPdfs.map((f) => `${f.name} (${(f.size / (1024*1024)).toFixed(1)} MB)`).join(', ');
      alert(`PDF size limit is ${maxPdfMB} MB. Remove oversized PDFs: ${names}`);
      return;
    }
    const isAllowedFile = (file) => {
      if (!file || !file.type) return false;
      return file.type.startsWith('image/') || file.type === 'application/pdf';
    };
    const invalidFiles = files.filter((f) => !isAllowedFile(f));
    if (invalidFiles.length > 0) {
      const names = invalidFiles.map((f) => f?.name || '(unnamed)').join(', ');
      alert(`Only image files (JPG, PNG, etc.) and PDFs are allowed. Remove invalid files: ${names}`);
      return;
    }
    const th = Math.max(0, Math.min(100, parseInt(threshold || 75, 10)));
    setStatus(mode === 'gemini' ? 'Uploading to server…' : 'Running Tesseract…');
    // Reset all derived state for a fresh session
    setCombinedLines([]);
    setOcrReady(false);
    setActiveTab(null);
    setProgress(0); setProgLabel('');
    setIsProcessing(true);
    setSummary(''); setTranslations([]); setQuestion(''); setAnswer('');

    const combined = [];
    try {
      // Create a new logical session for this run
      await createNewSessionFromFiles(files);
      for (let i = 0; i < files.length; i += 1) {
        const originalFile = files[i];
        if (originalFile && originalFile.type === 'application/pdf') {
          setProgLabel(`Rendering PDF (${i + 1}/${files.length}): ${originalFile.name || 'document.pdf'}`);
          const pdfData = new Uint8Array(await originalFile.arrayBuffer());
          const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width; canvas.height = viewport.height;
            await page.render({ canvasContext: ctx, viewport }).promise;
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.92));
            const pageFile = new File([blob], `pdf-page-${pageNum}.png`, { type: 'image/png' });

            // For PDF pages, prefer server OCR path to leverage Gemini
            setStatus('Processing PDF page on server…');
            const serverRes = await runServerOCRSingle(pageFile);
            const pageLines = Array.isArray(serverRes.lines) ? serverRes.lines : [];
            if (combined.length > 0) combined.push(`=== PDF Page ${pageNum} End ===`);
            combined.push(...pageLines);
          }
          continue;
        }

        const file = await resizeImageFile(originalFile, 2000);
        let source = 'tesseract';
        let text = '';
        let confidence;
        if (mode !== 'gemini') {
          setProgLabel(`Recognizing (${i + 1}/${files.length}): ${file.name}`);
          const local = await tesseractRecognizeSingle(file, lang || 'eng');
          text = local.text; confidence = local.confidence;
        }
        if (mode === 'gemini' || (mode === 'auto' && needsFallback(confidence, text, th))) {
          setStatus(`Processing on server…`);
          const serverRes = await runServerOCRSingle(file);
          const pageLines = Array.isArray(serverRes.lines) ? serverRes.lines : [];
          text = pageLines.join('\n'); source = 'gemini';
        }
        if (combined.length > 0) combined.push(`=== Image ${i} End ===`);
        combined.push(...toLines(text));
      }
      setCombinedLines(combined);
      setStatus('Done');
      setOcrReady(true);
      setActiveTab('ocr');
      try { localStorage.setItem('ocrLastPassage', combined.join('\n')); } catch {}
      updateSessionResult({ ocr: combined.join('\n') });
    } catch (err) {
      console.warn('OCR flow error:', err);
      setStatus('Error: ' + (err && err.message ? err.message : String(err)));
      setOcrReady(false);
    } finally {
      setProgress(1);
      setIsProcessing(false);
    }
  };

  const summarize = async () => {
    const text = combinedText;
    if (!text) { setSummary('No text available. Run OCR first.'); return; }
    setSummary('Summarizing…');
    try {
      const url = `${endpoint.replace(/\/$/, '')}/summarize`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, classLevel }) });
      const bodyText = await res.text();
      let data = null; try { data = JSON.parse(bodyText); } catch {}
      if (!res.ok) { setSummary(`HTTP ${res.status}: ${data?.error || bodyText}`); return; }
      const textOut = (data && data.summary) ? data.summary : '(empty)';
      setSummary(textOut);
      updateSessionResult({ summarize: textOut });
    } catch (e) { setSummary('Error: ' + (e && e.message ? e.message : String(e))); }
  };

  const translate = async () => {
    const text = combinedText;
    if (!text) { setTranslations(['No text available. Run OCR first.']); return; }
    if (!targetLang) { setTranslations(['Enter target language.']); return; }
    try {
      const url = `${endpoint.replace(/\/$/, '')}/translate`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, targetLang }) });
      const bodyText = await res.text();
      let data = null; try { data = JSON.parse(bodyText); } catch {}
      if (!res.ok) { setTranslations([`HTTP ${res.status}: ${data?.error || bodyText}`]); return; }
      const arr = Array.isArray(data?.translations) ? data.translations : [];
      setTranslations(arr);
      try { localStorage.setItem('ocrLastTranslation', (arr || []).join('\n')); } catch {}
      updateSessionResult({ translations: arr });
    } catch (e) { setTranslations(['Error: ' + (e && e.message ? e.message : String(e))]); }
  };

  const ask = async () => {
    const text = combinedText;
    if (!text) { setAnswer('No text available. Run OCR first.'); return; }
    const q = String(question || '').trim();
    if (!q) { setAnswer('Enter a question.'); return; }
    setAnswer('Thinking…');
    try {
      const url = `${endpoint.replace(/\/$/, '')}/qa`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, question: q }) });
      const bodyText = await res.text();
      let data = null; try { data = JSON.parse(bodyText); } catch {}
      if (!res.ok) { setAnswer(`HTTP ${res.status}: ${data?.error || bodyText}`); return; }
      const ans = (data && data.answer) ? data.answer : '(empty)';
      setAnswer(ans);
      appendSessionQa(q, ans);
    } catch (e) { setAnswer('Error: ' + (e && e.message ? e.message : String(e))); }
  };

  const submitFeedback = async () => {
    setFeedbackStatus('');
    if (!formspreeEndpoint) { setFeedbackStatus('Form is not configured. Add VITE_FORMSPREE_ID.'); return; }
    const name = String(feedbackName || '').trim();
    const feature = String(feedbackFeature || '').trim();
    if (!name || !feature) { setFeedbackStatus('Please enter your name and the requested feature.'); return; }
    try {
      setIsSubmittingFeedback(true);
      const formData = new FormData();
      formData.append('name', name);
      formData.append('feature', feature);
      formData.append('_subject', 'Kiddyverse Feedback');
      formData.append('_origin', window.location.origin);
      const res = await fetch(formspreeEndpoint, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: formData,
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); if (j && j.errors && j.errors.length) msg += `: ${j.errors.map(e => e.message).join(', ')}`; } catch {}
        setFeedbackStatus(`Error sending feedback: ${msg}`);
        return;
      }
      setFeedbackStatus('Thanks! Your feedback has been sent.');
      setFeedbackFeature('');
    } catch (e) {
      setFeedbackStatus('Error sending feedback: ' + (e && e.message ? e.message : String(e)) + '. If this persists, try disabling ad blockers or network filters.');
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  const extractDisabled = !files.length || isProcessing;
  const translationClean = Array.isArray(translations) ? translations.join('\n') : (translations || '').toString();

  return (
    <div className="container">
      <header className="header">
        <h1 style={{ margin: 0 }}>Kiddyverse</h1>
        <p className="subtitle">OCR with Tesseract and Gemini fallback. Summarize, Translate, and Q&amp;A.</p>
        <p> Note: For simple images use Tesseract only mode. For complex images use Gemini only mode.</p>
      </header>

      <div className="card section">
        <div className="row cols-3">
          <div>
            <div className="label">Mode</div>
            <select className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="auto">Auto</option>
              <option value="tesseract">Tesseract only</option>
              <option value="gemini">Gemini only</option>
            </select>
          </div>
          <div>
            <div className="label">Language (Tesseract)</div>
            <select className="select" value={lang} onChange={(e) => setLang(e.target.value)} disabled={mode === 'gemini'}>
              <option value="eng">English (eng)</option>
              <option value="spa">Spanish (spa)</option>
              <option value="fra">French (fra)</option>
              <option value="deu">German (deu)</option>
              <option value="hin">Hindi (hin)</option>
            </select>
          </div>
          <div>
            <div className="label">Images or PDF</div>
            <input className="input" type="file" accept="image/*,application/pdf" multiple onChange={onPickFiles} />
          </div>
        </div>

        <div className="section row cols-2">
          <button className="button primary" onClick={runOCR} disabled={extractDisabled}>
            {isProcessing ? 'Uploading' : (files.length ? 'Upload' : 'Upload')}
          </button>
          <div className="progressWrap">
            {isProcessing && <span className="spinner" aria-label="processing" />}
            <progress value={progress} max={1} />
            <span className="hint">{progLabel}</span>
          </div>
        </div>
      </div>

      {ocrReady && (
        <div className="card section">
          <div className="tabBar">
            <button className={`tabButton ${activeTab === 'ocr' ? 'active' : ''}`} onClick={() => setActiveTab('ocr')}>OCR</button>
            <button className={`tabButton ${activeTab === 'summarize' ? 'active' : ''}`} onClick={() => setActiveTab('summarize')}>Summarize</button>
            <button className={`tabButton ${activeTab === 'qa' ? 'active' : ''}`} onClick={() => setActiveTab('qa')}>Question &amp; Answer</button>
            <button className={`tabButton ${activeTab === 'translate' ? 'active' : ''}`} onClick={() => setActiveTab('translate')}>Translations</button>
          </div>

            {activeTab === 'ocr' && (
              <div className="section">
                <div className="row cols-2">
                  <div className="label">Extracted Text</div>
                  <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
                    <button className="button ghost" onClick={() => speak(combinedText, 'English')} disabled={!combinedText}>🔊 Speak</button>
                    <button className="button ghost" onClick={() => downloadTextFile('ocr-extracted.txt', combinedText)} disabled={!combinedText}>Download</button>
                  </div>
                </div>
                <div className="section">
                  <pre>{combinedText || '(no text extracted yet)'}</pre>
                </div>
              </div>
            )}

            {activeTab === 'summarize' && (
              <div className="section">
                <div className="row cols-2">
                  <div>
                    <div className="label">Class Level</div>
                    <select className="select" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
                      {['3','4','5','6','7','8','9','10','11','12'].map((v) => (<option key={v} value={v}>{v}</option>))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <button className="button primary" onClick={summarize}>Summarize</button>
                    <button className="button ghost" style={{ marginLeft: 8 }} onClick={() => speak(summary, 'English')}>🔊 Speak</button>
                  </div>
                </div>
                <div className="section">
                  <pre>{summary || '(no summary yet)'}</pre>
                </div>
              </div>
            )}

            {activeTab === 'qa' && (
              <div className="section">
                <div className="row cols-2">
                  <div>
                    <div className="label">Question</div>
                    <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question strictly about the passage" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end' }}>
                    <button className="button primary" onClick={ask}>Ask</button>
                    <button className="button ghost" style={{ marginLeft: 8 }} onClick={() => speak(answer, 'English')}>🔊 Speak Answer</button>
                  </div>
                </div>
                <div className="section">
                  <pre>{answer || '(no answer yet)'}</pre>
                </div>
              </div>
            )}

            {activeTab === 'translate' && (
              <div className="section">
                <div className="row cols-2">
                  <div>
                    <div className="label">Target Language</div>
                    <input className="input" value={targetLang} onChange={(e) => setTargetLang(e.target.value)} placeholder="e.g., Hindi" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
                    <button className="button primary" onClick={translate}>Translate</button>
                    <button className="button ghost" onClick={() => downloadPdfFromText('translation.pdf', translationClean)} disabled={!translationClean}>Download</button>
                  </div>
                </div>
                <div className="section">
                  <div className="label">Translation</div>
                  <pre>{translationClean}</pre>
                </div>
              </div>
            )}

        </div>
      )}

      <div className="card section">
        <div className="tabBar">
          <button
            className={`tabButton ${isHistoryOpen ? 'active' : ''}`}
            onClick={() => {
              setIsHistoryOpen(true);
              setIsFeedbackOpen(false);
            }}
          >
            History
          </button>
          <button
            className={`tabButton ${isFeedbackOpen ? 'active' : ''}`}
            onClick={() => {
              setIsFeedbackOpen(true);
              setIsHistoryOpen(false);
            }}
          >
            Feedback
          </button>
        </div>
      </div>

      {isHistoryOpen && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>History</h3>
          <HistoryView currentSessionId={currentSessionId} />
        </div>
      )}

      {isFeedbackOpen && (
        <div className="card section">
          <h3 style={{ marginTop: 0 }}>Feedback</h3>
          {!formspreeId ? (
            <div className="hint">Set VITE_FORMSPREE_ID in your environment to enable this form.</div>
          ) : fsState.succeeded ? (
            <p>Thanks! Your feedback has been sent.</p>
          ) : (
            <form onSubmit={fsHandleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row cols-2">
                <div>
                  <div className="label">Your Name</div>
                  <input className="input" name="name" value={feedbackName} onChange={(e) => setFeedbackName(e.target.value)} placeholder="Name" required />
                  <ValidationError prefix="Name" field="name" errors={fsState.errors} />
                </div>
              </div>
              <div>
                <div className="label">Requested Feature</div>
                <textarea className="input" name="feature" rows={6} value={feedbackFeature} onChange={(e) => setFeedbackFeature(e.target.value)} placeholder="Describe the feature or improvement you want" required />
                <ValidationError prefix="Feature" field="feature" errors={fsState.errors} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button primary" type="submit" disabled={fsState.submitting}>
                  {fsState.submitting ? 'Sending…' : 'Send Feedback'}
                </button>
                {feedbackStatus && <div className="hint" aria-live="polite">{feedbackStatus}</div>}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
} 

function HistoryView({ currentSessionId }) {
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(currentSessionId || '');
  const [sessionData, setSessionData] = useState(null);
  const [expandSummary, setExpandSummary] = useState(false);
  const [expandTranslations, setExpandTranslations] = useState(false);
  const [expandQa, setExpandQa] = useState(false);

  function clearHistory() {
    const ok = window.confirm('This will permanently delete all history stored. Continue?');
    if (!ok) return;
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === 'sessions' || k === 'currentSessionId' || k.startsWith('session:')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {}
    setSessions([]);
    setSelectedId('');
    setSessionData(null);
    setExpandSummary(false);
    setExpandTranslations(false);
    setExpandQa(false);
  }

  useEffect(() => {
    try {
      const arr = JSON.parse(localStorage.getItem('sessions') || '[]');
      setSessions(Array.isArray(arr) ? arr : []);
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    const id = selectedId || (sessions[0]?.id || '');
    if (!id) { setSessionData(null); return; }
    try { setSessionData(JSON.parse(localStorage.getItem(`session:${id}`) || 'null')); } catch { setSessionData(null); }
  }, [selectedId, sessions]);

  if (!sessions.length) {
    return <div className="hint">No history yet. Run OCR to create a new session.</div>;
  }

  return (
    <div className="section">
      <div className="row cols-2" style={{ alignItems: 'end' }}>
        <div>
          <div className="label">Sessions</div>
          <select className="select" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Latest</option>
            {sessions.map(s => (
              <option key={s.id} value={s.id}>{s.id}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          {sessions.length > 0 && (
            <button className="button ghost" onClick={clearHistory} aria-label="Clear all history">Clear History</button>
          )}
        </div>
      </div>

      {!sessionData ? (
        <div className="hint" style={{ marginTop: 8 }}>Select a session to view details.</div>
      ) : (
        <div className="section">
          <div className="label">Input Files</div>
          <ul>
            {(sessionData.files || []).map((f, idx) => (
              <li key={idx} style={{ marginBottom: 8 }}>
                <div>{f.name} ({f.type}, {f.size} bytes)</div>
                {f.preview && (<img src={f.preview} alt={f.name} style={{ maxWidth: 200, display: 'block', marginTop: 4 }} />)}
              </li>
            ))}
          </ul>

          <button className="button" onClick={() => setExpandSummary(v => !v)} style={{ marginTop: 8 }}>
            {expandSummary ? 'Hide' : 'Show'} Summarize Result
          </button>
          {!expandSummary ? (
            <div className="hint">{sessionData.results?.summarize ? 'Click to view summary' : 'Not used this feature yet'}</div>
          ) : (
            <pre>{sessionData.results?.summarize || 'Not used this feature yet'}</pre>
          )}

          <button className="button" onClick={() => setExpandTranslations(v => !v)} style={{ marginTop: 8 }}>
            {expandTranslations ? 'Hide' : 'Show'} Translations
          </button>
          {!expandTranslations ? (
            <div className="hint">{Array.isArray(sessionData.results?.translations) && sessionData.results.translations.length ? 'Click to view translations' : 'Not used this feature yet'}</div>
          ) : (
            <pre>{Array.isArray(sessionData.results?.translations) && sessionData.results.translations.length ? sessionData.results.translations.join('\n') : 'Not used this feature yet'}</pre>
          )}

          <button className="button" onClick={() => setExpandQa(v => !v)} style={{ marginTop: 8 }}>
            {expandQa ? 'Hide' : 'Show'} Q&A
          </button>
          {!expandQa ? (
            <div className="hint">{Array.isArray(sessionData.results?.qa) && sessionData.results.qa.length ? 'Click to view Q&A history' : 'Not used this feature yet'}</div>
          ) : (
            <>
              {Array.isArray(sessionData.results?.qa) && sessionData.results.qa.length ? (
                <ul>
                  {sessionData.results.qa.map((x, i) => (
                    <li key={i}>
                      <strong>Q:</strong> {x.q}
                      <br />
                      <strong>A:</strong> {x.a}
                      <br />
                      <span className="hint">{x.at}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>Not used this feature yet</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}