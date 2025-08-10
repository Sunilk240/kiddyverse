import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Tesseract from 'tesseract.js';
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

  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState('Idle');
  const [progress, setProgress] = useState(0);
  const [progLabel, setProgLabel] = useState('');
  const [combinedLines, setCombinedLines] = useLocalStorage('ocrCombinedLines', []);
  const [ocrReady, setOcrReady] = useState(false);
  const [activeTab, setActiveTab] = useState(null); // 'summarize' | 'qa' | 'translate'
  const [isProcessing, setIsProcessing] = useState(false);

  const [summary, setSummary] = useLocalStorage('summary', '');
  const [classLevel, setClassLevel] = useLocalStorage('classLevel', '7');

  const [translations, setTranslations] = useLocalStorage('translations', []);
  const [targetLang, setTargetLang] = useLocalStorage('targetLang', 'Hindi');

  const [question, setQuestion] = useLocalStorage('question', '');
  const [answer, setAnswer] = useLocalStorage('answer', '');

  const combinedText = useMemo(() => (Array.isArray(combinedLines) ? combinedLines.join('\n') : ''), [combinedLines]);

  const onPickFiles = (e) => {
    setFiles(Array.from(e.target.files || []));
  };

  const runServerOCRSingle = useCallback(async (file) => {
    const url = `${endpoint.replace(/\/$/, '')}/ocr/gemini`;
    const form = new FormData();
    form.append('images', file, file.name);
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) { const text = await res.text(); throw new Error(`Server OCR failed (${res.status}): ${text}`); }
    return res.json();
  }, [endpoint]);

  const runServerOCRPdf = useCallback(async (file) => {
    const url = `${endpoint.replace(/\/$/, '')}/ocr/pdf`;
    const form = new FormData();
    form.append('pdf', file, file.name || 'document.pdf');
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) { const text = await res.text(); throw new Error(`PDF OCR failed (${res.status}): ${text}`); }
    return res.json();
  }, [endpoint]);

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
    if (!files.length) { alert('Please upload image(s) first.'); return; }
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
      setActiveTab('summarize');
      try { localStorage.setItem('ocrLastPassage', combined.join('\n')); } catch {}
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
      setSummary((data && data.summary) ? data.summary : '(empty)');
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
      setAnswer((data && data.answer) ? data.answer : '(empty)');
    } catch (e) { setAnswer('Error: ' + (e && e.message ? e.message : String(e))); }
  };

  const extractDisabled = !files.length || isProcessing;
  const translationClean = Array.isArray(translations) ? translations.join('\n') : (translations || '').toString();

  return (
    <div className="container">
      <header className="header">
        <h1 style={{ margin: 0 }}>Kiddyverse</h1>
        <p className="subtitle">OCR with Tesseract and Gemini fallback. Summarize, Translate, and Q&amp;A.</p>
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

      {!ocrReady ? null : (
        <>
          <div className="card section">
            <div className="tabBar">
              <button className={`tabButton ${activeTab === 'summarize' ? 'active' : ''}`} onClick={() => setActiveTab('summarize')}>Summarize</button>
              <button className={`tabButton ${activeTab === 'qa' ? 'active' : ''}`} onClick={() => setActiveTab('qa')}>Question &amp; Answer</button>
              <button className={`tabButton ${activeTab === 'translate' ? 'active' : ''}`} onClick={() => setActiveTab('translate')}>Translations</button>
            </div>

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
        </>
      )}
    </div>
  );
} 