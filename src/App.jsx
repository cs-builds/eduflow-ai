import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, 
  Mic, 
  Image as ImageIcon, 
  FileText, 
  Play, 
  Download, 
  Share2, 
  User, 
  Home, 
  PlusCircle, 
  Trash2, 
  CheckCircle,
  Wand2,
  ChevronRight,
  Settings,
  UploadCloud,
  Layers,
  Music,
  Target,
  List,
  Maximize2,
  Eye,
  Zap,
  Clock,
  Copy
} from 'lucide-react';

// --- CONFIGURATION ---
const apiKey = ""; // Correct variable name for environment key injection
const ENDPOINTS = {
  TEXT: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
  IMAGE: `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${apiKey}`,
  AUDIO: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`
};

// --- UTILS ---

const cleanJSON = (text) => {
  try {
    const cleaned = text.replace(/```json\n?|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Failed. Raw text:", text);
    throw new Error("AI returned invalid JSON format.");
  }
};

const loadPdfLib = async () => {
  if (window.pdfjsLib) return window.pdfjsLib;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF library'));
    document.head.appendChild(script);
  });
};

const generateId = () => Math.random().toString(36).substr(2, 9);

const formatDate = (dateString) => {
  const options = { year: 'numeric', month: 'short', day: 'numeric' };
  return new Date(dateString).toLocaleDateString(undefined, options);
};

const downloadBase64 = (base64Data, fileName, mimeType) => {
  const link = document.createElement('a');
  link.href = `data:${mimeType};base64,${base64Data}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// Robust Audio Conversion
const base64ToAudioUrl = (base64) => {
  try {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/wav' }); 
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error("Audio Conversion Error:", e);
    return null;
  }
};

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text);
  alert("Copied to clipboard!");
};

export default function EduFlow() {
  // --- STATE ---
  const [activeTab, setActiveTab] = useState('home');
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [userProfile, setUserProfile] = useState({
    name: 'Professor User',
    xp: 1250,
    role: 'Content Scholar',
    level: 5
  });

  // Wizard State 
  // 1: Upload, 2: Structure, 3: Angles, 4: Script Config, 5: Review, 6: Metadata, 7: Studio
  const [wizardStep, setWizardStep] = useState(1); 
  
  const [currentProject, setCurrentProject] = useState({
    id: null,
    pdfName: '',
    pdfImages: [], 
    pdfRawText: '', 
    structureOptions: [], 
    selectedScope: '', 
    angles: [],
    selectedAngle: null,
    scriptDuration: 'medium', // short, medium, long, custom
    customMinutes: '', // Store custom minutes
    script: '',
    audioUrl: null,
    audioBase64: null,
    thumbnailBase64: null,
    title: '',
    description: '',
    hashtags: '',
    createdAt: null
  });

  const fileInputRef = useRef(null);
  const audioRef = useRef(null);

  // --- EFFECT: LOAD DATA ---
  useEffect(() => {
    const savedProjects = localStorage.getItem('eduflow_projects');
    if (savedProjects) setProjects(JSON.parse(savedProjects));
    const savedProfile = localStorage.getItem('eduflow_profile');
    if (savedProfile) setUserProfile(JSON.parse(savedProfile));
  }, []);

  // --- EFFECT: SAVE DATA ---
  useEffect(() => {
    localStorage.setItem('eduflow_projects', JSON.stringify(projects));
  }, [projects]);

  // --- API HANDLERS ---

  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      alert("Please upload a valid PDF file.");
      return;
    }

    setLoading(true);
    setLoadingMsg('Initializing Hybrid Scanner...');

    try {
      const pdfjsLib = await loadPdfLib();
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      
      const images = [];
      let fullRawText = '';
      
      // We scan more pages visually to ensure we capture Module headers correctly
      const maxVisualPages = Math.min(pdf.numPages, 15); 
      
      setLoadingMsg(`Scanning ${pdf.numPages} pages (Text + Vision)...`);

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item) => item.str).join(' ');
        fullRawText += `[Page ${i}]\n${pageText}\n\n`;

        if (i <= maxVisualPages) {
          if (i % 2 === 0) setLoadingMsg(`Visually scanning page ${i}...`);
          
          const viewport = page.getViewport({ scale: 1.0 });
          const canvas = document.createElement('canvas');
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          
          const renderContext = {
            canvasContext: canvas.getContext('2d'),
            viewport: viewport
          };

          await page.render(renderContext).promise;
          const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
          images.push(base64);
        }
      }

      const newProject = {
        ...currentProject,
        id: generateId(),
        pdfName: file.name,
        pdfImages: images, 
        pdfRawText: fullRawText,
        createdAt: new Date().toISOString()
      };

      setCurrentProject(newProject);
      analyzeStructure(images, fullRawText, newProject);

    } catch (err) {
      console.error(err);
      alert("Error reading PDF: " + err.message);
      setLoading(false);
    }
  };

  const analyzeStructure = async (images, text, projectState) => {
    setLoading(true);
    setLoadingMsg('Professor is identifying Modules & Topics...');

    const useImages = text.length < 500; 

    const prompt = `
      Analyze this document structure.
      Look specifically for "Modules", "Chapters", "Units" or distinct "Topic Headings".
      
      TASK:
      1. Identify the top 3-4 distinct Modules/Topics found in the text.
      2. ALWAYS include "Full Document Masterclass" as the FIRST option.
      
      Return JSON:
      {
        "options": [
          { "title": "Full Document Masterclass", "description": "Comprehensive analysis of all modules/topics." },
          { "title": "[Module X: Name]", "description": "Focus on [Topic details]" }
        ]
      }
    `;

    const payload = {
      contents: [{ 
        parts: [
          { text: prompt },
          ...(useImages ? images.slice(0, 3).map(img => ({ inlineData: { mimeType: "image/jpeg", data: img } })) : [{ text: text.substring(0, 30000) }])
        ] 
      }],
      generationConfig: { responseMimeType: "application/json" }
    };

    try {
      const response = await fetch(ENDPOINTS.TEXT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) throw new Error("Structure API Error");
      
      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      const result = cleanJSON(rawText);

      setCurrentProject(prev => ({ 
        ...prev, 
        structureOptions: result.options 
      }));
      
      setWizardStep(2); 
      setLoading(false);

    } catch (err) {
      console.error(err);
      setCurrentProject(prev => ({ 
        ...prev, 
        structureOptions: [{ title: "Full Document Masterclass", description: "Complete analysis." }] 
      }));
      setWizardStep(2);
      setLoading(false);
    }
  };

  const analyzePdfInsights = async (scopeTitle, scopeDesc) => {
    setLoading(true);
    setLoadingMsg(`Deep analysis of: ${scopeTitle}...`);

    setCurrentProject(prev => ({ ...prev, selectedScope: scopeTitle }));

    const isFullDoc = scopeTitle.toLowerCase().includes('full') || scopeTitle.toLowerCase().includes('masterclass');

    const prompt = `
      You are a Strict Academic Researcher and PhD Professor.
      
      TASK: Analyze the provided Document Content.
      SCOPE: "${scopeTitle}" - ${scopeDesc}
      
      CRITICAL INSTRUCTIONS:
      1. REAL CONTENT ONLY: Do not hallucinate. Use specific details from the file.
      2. If SCOPE is specific (e.g., Module 5), focus ONLY on that module's content found in the document.
      
      OUTPUT:
      Generate a JSON object with a "summary" and exactly 3 "angles".
      
      ${isFullDoc ? `
      - Angle 1: "The Complete Masterclass" (Covering all modules)
      - Angle 2: "Key Concepts & Critical Definitions"
      - Angle 3: "Exam Focus & Final Conclusions"
      ` : `
      - Angle 1: Focus on the Main Heading/Core Concept of this Module.
      - Angle 2: Focus on a specific "Trick", "Technique" or "Process" in this module.
      - Angle 3: Practical application/Case Study mentioned.
      `}

      Return JSON:
      {
        "summary": "Detailed, factual summary...",
        "angles": [
           {"title": "Angle 1 Title", "description": "Description..."},
           {"title": "Angle 2 Title", "description": "Description..."},
           {"title": "Angle 3 Title", "description": "Description..."}
        ]
      }
    `;

    const imageParts = currentProject.pdfImages.slice(0, 10).map(img => ({
      inlineData: { mimeType: "image/jpeg", data: img }
    }));
    const textPart = { text: `DOCUMENT TEXT:\n${currentProject.pdfRawText.substring(0, 45000)}` };

    try {
      const response = await fetch(ENDPOINTS.TEXT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ 
            parts: [
              { text: prompt },
              textPart,
              ...imageParts 
            ] 
          }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      
      if (!response.ok) throw new Error("Analysis API Error");

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      const result = cleanJSON(rawText);
      
      setCurrentProject(prev => ({ ...prev, angles: result.angles, summary: result.summary }));
      setWizardStep(3); 
      setLoading(false);
    } catch (err) {
      console.error(err);
      alert("Analysis Failed. " + err.message);
      setLoading(false);
    }
  };

  const handleAngleSelection = (angle) => {
    setCurrentProject(prev => ({ ...prev, selectedAngle: angle }));
    setWizardStep(4); // Go to Duration Select
  };

  const generateScript = async () => {
    setWizardStep(5);
    setLoading(true);
    
    // Calculate Word Count based on Duration
    let minutes = 3; // Default medium
    if (currentProject.scriptDuration === 'short') minutes = 2;
    if (currentProject.scriptDuration === 'medium') minutes = 5;
    if (currentProject.scriptDuration === 'long') minutes = 10;
    if (currentProject.scriptDuration === 'custom' && currentProject.customMinutes) {
      minutes = parseInt(currentProject.customMinutes) || 5;
    }

    const wordsPerMinute = 150;
    const targetWords = minutes * wordsPerMinute;
    
    setLoadingMsg(`Drafting ${minutes} minute script (~${targetWords} words)...`);

    const prompt = `
      Write a YouTube educational script for: "${currentProject.selectedAngle.title}".
      
      SOURCE MATERIAL:
      ${currentProject.summary}
      
      TARGET DURATION: ${minutes} Minutes (Approx ${targetWords} words).
      
      MANDATORY STRUCTURE (Strictly follow this):
      1. START EXACTLY WITH: "Welcome Back to Edu Star Youtube channel and If you are first time to our channel Dont forgot to subscribe to our chanel done misss updates and lets start todays video...now today we are talking about..."
      2. BODY: Explain the content like a PhD Professor. 
         - Be detailed and cover the timeline required.
         - Use specific facts, definitions, and logic from the source. 
         - NO FLUFF.
      3. END EXACTLY WITH: "Thank You, Dont forget to subscribe to edu star youtube channel see you in the next video thank you for watching"
      
      Format: Just the spoken text.
    `;

    try {
      const response = await fetch(ENDPOINTS.TEXT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) throw new Error("Script API Error");
      
      const data = await response.json();
      const scriptText = data.candidates[0].content.parts[0].text;
      
      setCurrentProject(prev => ({ ...prev, script: scriptText }));
      setLoading(false);
    } catch (err) {
      alert("Script generation failed: " + err.message);
      setLoading(false);
    }
  };

  const generateMetadata = async () => {
    setWizardStep(6);
    setLoading(true);
    setLoadingMsg('Generating 50+ Viral Hashtags & SEO Title...');
    
    const prompt = `
      Based on this script, generate:
      1. A High-Ranking SEO YouTube Title (Clickbait but factual).
      2. A Compelling Description (First 2 lines hook).
      3. STRICTLY PROVIDE 50+ VIRAL HASHTAGS (Comma separated).
      
      Return JSON: { "title": "", "description": "", "hashtags": "" }
      
      Script Preview: ${currentProject.script.substring(0, 1000)}...
    `;

    try {
      const response = await fetch(ENDPOINTS.TEXT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });

      if (!response.ok) throw new Error("Metadata API Error");

      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      const meta = cleanJSON(rawText);
      
      setCurrentProject(prev => ({ 
        ...prev, 
        title: meta.title, 
        description: meta.description, 
        hashtags: meta.hashtags 
      }));
      setLoading(false);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  };

  const generateAudio = async (gender) => {
    setLoading(true);
    setLoadingMsg(`Recording ${gender === 'M' ? "Professor Kore" : "Professor Puck"}...`);

    const voiceName = gender === 'M' ? 'Kore' : 'Puck';
    
    try {
      // NOTE: For very long scripts, text-to-speech might truncate or fail.
      // We send the full script, but warn if it fails.
      const payload = {
        contents: [{ parts: [{ text: currentProject.script }] }],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName
                }
              }
            }
        }
      };

      const response = await fetch(ENDPOINTS.AUDIO, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        if (response.status === 401) throw new Error("API Key Invalid or Missing.");
        throw new Error(`Audio API Error: ${response.status} (Script might be too long)`);
      }
      
      const data = await response.json();
      
      if (data.candidates && data.candidates[0].content.parts[0].inlineData) {
        const audioBase64 = data.candidates[0].content.parts[0].inlineData.data;
        const url = base64ToAudioUrl(audioBase64);
        
        if (!url) throw new Error("Failed to decode audio data.");

        setCurrentProject(prev => ({ 
          ...prev, 
          audioUrl: url, 
          audioBase64: audioBase64 
        }));
      } else {
        throw new Error("No audio data returned. The script might be too long for a single request.");
      }
      
      setLoading(false);
    } catch (err) {
      console.error(err);
      alert("Audio generation failed. " + err.message);
      setLoading(false);
    }
  };

  const generateThumbnail = async () => {
    setLoading(true);
    setLoadingMsg('Painting final thumbnail...');

    const prompt = `
      High quality YouTube thumbnail for: "${currentProject.title}".
      Style: Professional, academic, dramatic lighting.
      Visuals: ${currentProject.selectedAngle.description}.
      Text overlay: "EDUSTAR". 
      Photorealistic, 16:9 aspect ratio.
    `;

    try {
      const response = await fetch(ENDPOINTS.IMAGE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: prompt }],
          parameters: { sampleCount: 1 }
        })
      });

      if (!response.ok) throw new Error("Image API Error");
      
      const data = await response.json();
      const b64 = data.predictions[0].bytesBase64Encoded;
      
      setCurrentProject(prev => ({ ...prev, thumbnailBase64: b64 }));
      setLoading(false);
    } catch (err) {
      console.error(err);
      alert("Thumbnail generation failed.");
      setLoading(false);
    }
  };

  const saveProject = () => {
    const newProjects = [currentProject, ...projects];
    setProjects(newProjects);
    setActiveTab('projects');
    setWizardStep(1);
    setCurrentProject({
      id: null, pdfName: '', pdfImages: [], pdfRawText: '', structureOptions: [], selectedScope: '', angles: [], selectedAngle: null, scriptDuration: 'medium', customMinutes: '', script: '', audioUrl: null, audioBase64: null, thumbnailBase64: null, title: '', description: '', hashtags: '', createdAt: null
    });
  };

  // --- UI COMPONENTS ---

  const LoadingOverlay = () => (
    <div className="fixed inset-0 z-50 bg-slate-900/95 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-300">
      <div className="relative w-24 h-24 mb-6">
        <div className="absolute inset-0 border-t-4 border-indigo-500 border-solid rounded-full animate-spin"></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <Eye className="w-10 h-10 text-indigo-400 animate-pulse" />
        </div>
      </div>
      <h2 className="text-2xl font-bold text-white mb-2">EduFlow AI</h2>
      <p className="text-indigo-200 text-lg animate-pulse">{loadingMsg}</p>
    </div>
  );

  const HomeView = () => (
    <div className="flex flex-col min-h-screen pb-24">
      <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-8 pt-16 rounded-b-[3rem] shadow-2xl">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Edu<span className="text-indigo-400">Flow</span></h1>
            <p className="text-indigo-200 mt-1">Real PDF Intelligence</p>
          </div>
          <div className="bg-indigo-600/30 p-2 rounded-full border border-indigo-500/50">
            <User className="text-indigo-300 w-6 h-6" />
          </div>
        </div>
        <div className="bg-white/10 backdrop-blur-md p-6 rounded-2xl border border-white/10 mb-6">
          <h3 className="text-indigo-300 text-sm font-semibold uppercase tracking-wider mb-2">Current Status</h3>
          <div className="flex items-end gap-2">
            <span className="text-4xl font-bold text-white">{userProfile.level}</span>
            <span className="text-indigo-200 mb-1">PhD Level</span>
          </div>
          <div className="w-full bg-slate-700 h-2 rounded-full mt-3 overflow-hidden">
            <div className="bg-indigo-500 h-full rounded-full" style={{ width: '75%' }}></div>
          </div>
        </div>
      </div>
      <div className="px-6 -mt-10">
        <button onClick={() => { setActiveTab('create'); setWizardStep(1); }} className="w-full bg-indigo-600 hover:bg-indigo-500 active:scale-95 transition-all text-white p-5 rounded-2xl shadow-xl shadow-indigo-900/50 flex items-center justify-between group">
          <div className="flex items-center gap-4">
            <div className="bg-white/20 p-3 rounded-xl">
              <PlusCircle className="w-8 h-8" />
            </div>
            <div className="text-left">
              <div className="font-bold text-lg">Start New Flow</div>
              <div className="text-indigo-200 text-sm">Upload PDF</div>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-indigo-300 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );

  const CreateView = () => (
    <div className="flex flex-col min-h-screen bg-slate-950 pb-24 px-4 pt-12">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => wizardStep > 1 && setWizardStep(prev => prev - 1)} className="text-slate-400">
           {wizardStep > 1 && "< Back"}
        </button>
        <span className="text-indigo-400 font-bold">Step {wizardStep} of 7</span>
        <div className="w-10"></div>
      </div>

      {/* STEP 1: UPLOAD */}
      {wizardStep === 1 && (
        <div className="flex flex-col items-center justify-center flex-1 animate-in slide-in-from-right duration-300">
          <div onClick={() => fileInputRef.current.click()} className="w-full aspect-square max-w-sm bg-slate-900 border-2 border-dashed border-slate-700 rounded-3xl flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-slate-800/50 transition-all group mb-6">
            <UploadCloud className="w-20 h-20 text-slate-500 group-hover:text-indigo-400 mb-4 transition-colors" />
            <h3 className="text-xl font-bold text-white mb-2">Upload PDF</h3>
            <p className="text-slate-400 text-center px-8">Tap to browse.</p>
            <input type="file" accept=".pdf" ref={fileInputRef} className="hidden" onChange={handlePdfUpload} />
          </div>
        </div>
      )}

      {/* STEP 2: STRUCTURE */}
      {wizardStep === 2 && (
        <div className="animate-in slide-in-from-right duration-300">
          <h2 className="text-2xl font-bold text-white mb-2">Structure</h2>
          <div className="space-y-4">
            {currentProject.structureOptions.map((opt, idx) => (
              <button key={idx} onClick={() => analyzePdfInsights(opt.title, opt.description)} className="w-full text-left bg-slate-800 hover:bg-slate-700 p-5 rounded-xl border border-slate-700 hover:border-indigo-500 transition-all group">
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${opt.title.includes('Full') ? 'bg-indigo-900/50 text-indigo-400' : 'bg-slate-700 text-slate-300'}`}>
                    {opt.title.includes('Full') ? <Maximize2 className="w-6 h-6" /> : <List className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1 group-hover:text-indigo-400 transition-colors">{opt.title}</h3>
                    <p className="text-slate-400 text-sm">{opt.description}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3: ANGLES */}
      {wizardStep === 3 && (
        <div className="animate-in slide-in-from-right duration-300">
          <h2 className="text-2xl font-bold text-white mb-2">Insights</h2>
          <div className="space-y-4">
            {currentProject.angles.map((angle, idx) => (
              <button key={idx} onClick={() => handleAngleSelection(angle)} className="w-full text-left bg-slate-800 hover:bg-slate-700 p-5 rounded-xl border border-slate-700 hover:border-indigo-500 transition-all group">
                <h3 className="text-lg font-bold text-white mb-1 group-hover:text-indigo-300 transition-colors">{angle.title}</h3>
                <p className="text-slate-400 text-sm">{angle.description}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* STEP 4: DURATION (WITH CUSTOM INPUT) */}
      {wizardStep === 4 && (
        <div className="animate-in slide-in-from-right duration-300">
           <h2 className="text-2xl font-bold text-white mb-6">Script Length</h2>
           <div className="grid grid-cols-1 gap-4">
             {['short', 'medium', 'long'].map((dur) => (
               <button 
                key={dur} 
                onClick={() => {
                   setCurrentProject(prev => ({ ...prev, scriptDuration: dur, customMinutes: '' }));
                }}
                className={`p-6 rounded-xl border-2 transition-all flex items-center justify-between ${currentProject.scriptDuration === dur ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-800 bg-slate-900'}`}
               >
                 <div className="flex items-center gap-4">
                   <Clock className={`w-8 h-8 ${currentProject.scriptDuration === dur ? 'text-indigo-400' : 'text-slate-500'}`} />
                   <div className="text-left">
                     <div className="font-bold text-white capitalize text-lg">{dur} Video</div>
                     <div className="text-slate-400 text-sm">
                        {dur === 'short' && '~2 Minutes'}
                        {dur === 'medium' && '~5 Minutes'}
                        {dur === 'long' && '~10 Minutes'}
                     </div>
                   </div>
                 </div>
                 {currentProject.scriptDuration === dur && <CheckCircle className="text-indigo-500" />}
               </button>
             ))}

             {/* CUSTOM INPUT */}
             <div className={`p-6 rounded-xl border-2 transition-all ${currentProject.scriptDuration === 'custom' ? 'border-indigo-500 bg-indigo-900/20' : 'border-slate-800 bg-slate-900'}`}>
                <div className="flex items-center gap-4 mb-3">
                   <Clock className="w-8 h-8 text-indigo-400" />
                   <div className="font-bold text-white text-lg">Custom Duration</div>
                </div>
                <input 
                  type="number" 
                  placeholder="Enter minutes (e.g. 15)" 
                  className="w-full bg-black/50 border border-slate-700 rounded-lg p-3 text-white focus:border-indigo-500 outline-none"
                  value={currentProject.customMinutes}
                  onChange={(e) => setCurrentProject(prev => ({ ...prev, scriptDuration: 'custom', customMinutes: e.target.value }))}
                  onFocus={() => setCurrentProject(prev => ({ ...prev, scriptDuration: 'custom' }))}
                />
             </div>
           </div>
           
           <button onClick={generateScript} className="w-full mt-8 bg-indigo-600 py-4 rounded-xl text-white font-bold hover:bg-indigo-500">
             Generate Script
           </button>
        </div>
      )}

      {/* STEP 5: SCRIPT REVIEW */}
      {wizardStep === 5 && (
        <div className="animate-in slide-in-from-right duration-300 flex flex-col h-full">
          <h2 className="text-2xl font-bold text-white mb-4">Review Script</h2>
          <div className="flex-1 bg-slate-900 rounded-xl border border-slate-700 p-4 mb-4">
            <textarea className="w-full h-96 bg-transparent text-slate-300 focus:outline-none resize-none leading-relaxed" value={currentProject.script} onChange={(e) => setCurrentProject({...currentProject, script: e.target.value})} />
          </div>
          <button onClick={generateMetadata} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-500 transition-colors">
            Approve & Generate Metadata
          </button>
        </div>
      )}

      {/* STEP 6: METADATA */}
      {wizardStep === 6 && (
        <div className="animate-in slide-in-from-right duration-300">
          <h2 className="text-2xl font-bold text-white mb-6">Viral Metadata</h2>
          
          <div className="space-y-6 mb-8">
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative group">
              <h3 className="text-indigo-400 font-bold mb-1 text-xs uppercase tracking-wider">SEO Title</h3>
              <p className="text-white text-lg font-medium">{currentProject.title}</p>
              <button onClick={() => copyToClipboard(currentProject.title)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><Copy className="w-4 h-4" /></button>
            </div>
            
            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative group">
              <h3 className="text-indigo-400 font-bold mb-1 text-xs uppercase tracking-wider">Description</h3>
              <p className="text-slate-300 text-sm leading-relaxed">{currentProject.description}</p>
              <button onClick={() => copyToClipboard(currentProject.description)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><Copy className="w-4 h-4" /></button>
            </div>

            <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 relative group">
              <h3 className="text-indigo-400 font-bold mb-1 text-xs uppercase tracking-wider">50+ Viral Hashtags</h3>
              <p className="text-blue-400 text-sm max-h-40 overflow-y-auto">{currentProject.hashtags}</p>
              <button onClick={() => copyToClipboard(currentProject.hashtags)} className="absolute top-4 right-4 text-slate-500 hover:text-white"><Copy className="w-4 h-4" /></button>
            </div>
          </div>

          <button onClick={() => setWizardStep(7)} className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-500 transition-colors">
            Proceed to Studio (Audio & Thumb)
          </button>
        </div>
      )}

      {/* STEP 7: STUDIO */}
      {wizardStep === 7 && (
        <div className="animate-in slide-in-from-right duration-300">
          <h2 className="text-2xl font-bold text-white mb-6">Final Production</h2>

          {/* Audio Gen */}
          <div className="mb-8">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2"><Mic className="w-5 h-5" /> Voiceover</h3>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => generateAudio('M')} className="bg-slate-800 p-4 rounded-xl border border-slate-700 hover:border-indigo-500 transition-all flex flex-col items-center gap-2">
                <User className="w-6 h-6 text-blue-400" />
                <span className="text-white font-medium">Male (Kore)</span>
              </button>
              <button onClick={() => generateAudio('F')} className="bg-slate-800 p-4 rounded-xl border border-slate-700 hover:border-pink-500 transition-all flex flex-col items-center gap-2">
                <User className="w-6 h-6 text-pink-400" />
                <span className="text-white font-medium">Female (Puck)</span>
              </button>
            </div>
            
            {/* Audio Player & Download */}
            {currentProject.audioUrl && (
              <div className="mt-4 bg-indigo-900/20 p-4 rounded-xl border border-indigo-500/30 animate-in fade-in slide-in-from-top-2">
                <audio ref={audioRef} src={currentProject.audioUrl} controls className="w-full h-10 mb-3" />
                <button 
                  onClick={() => downloadBase64(currentProject.audioBase64, `EduFlow_Audio_${currentProject.id}.wav`, 'audio/wav')}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-bold flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" /> Download Audio File
                </button>
              </div>
            )}
          </div>

          {/* Thumbnail Gen */}
          <div className="mb-8">
            <h3 className="text-white font-bold mb-3 flex items-center gap-2"><ImageIcon className="w-5 h-5" /> Thumbnail</h3>
            {currentProject.thumbnailBase64 ? (
              <div className="relative group">
                <img src={`data:image/png;base64,${currentProject.thumbnailBase64}`} alt="Thumb" className="w-full rounded-xl shadow-lg border border-slate-700" />
                <button onClick={generateThumbnail} className="absolute bottom-2 right-2 bg-black/60 text-white p-2 rounded-lg text-xs backdrop-blur-md">Regenerate</button>
              </div>
            ) : (
               <button onClick={generateThumbnail} className="w-full py-8 border-2 border-dashed border-slate-700 rounded-xl text-slate-400 hover:bg-slate-900 hover:border-indigo-500 transition-all">
                 Generate Viral Thumbnail
               </button>
            )}
          </div>

          {/* Finalize */}
          {(currentProject.audioUrl || currentProject.thumbnailBase64) && (
            <button onClick={saveProject} className="w-full bg-green-600 hover:bg-green-500 text-white py-4 rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center justify-center gap-2">
              <CheckCircle className="w-5 h-5" /> Save Project
            </button>
          )}
        </div>
      )}
    </div>
  );

  const ProjectsView = () => (
    <div className="flex flex-col min-h-screen bg-slate-950 pb-24 px-4 pt-12">
      <h2 className="text-3xl font-bold text-white mb-6">Library</h2>
      <div className="space-y-6">
        {projects.map((p) => (
          <div key={p.id} className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-xl">
            {p.thumbnailBase64 && (
              <div className="h-32 w-full overflow-hidden relative">
                <img src={`data:image/png;base64,${p.thumbnailBase64}`} className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 to-transparent"></div>
              </div>
            )}
            <div className="p-5">
              <h3 className="text-xl font-bold text-white mb-1 line-clamp-1">{p.title || "Untitled"}</h3>
              <p className="text-slate-400 text-xs mb-4">{formatDate(p.createdAt)} • {p.pdfName}</p>
              
              <div className="flex items-center gap-2 mt-4">
                {p.audioBase64 && (
                  <button onClick={() => downloadBase64(p.audioBase64, `audio_${p.id}.wav`, 'audio/wav')} className="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors">
                    <Download className="w-4 h-4" /> Audio
                  </button>
                )}
                {p.thumbnailBase64 && (
                  <button onClick={() => downloadBase64(p.thumbnailBase64, `thumb_${p.id}.png`, 'image/png')} className="flex-1 bg-slate-800 hover:bg-slate-700 py-2 rounded-lg text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors">
                    <Download className="w-4 h-4" /> Image
                  </button>
                )}
                <button onClick={() => { const updated = projects.filter(proj => proj.id !== p.id); setProjects(updated); }} className="bg-red-900/30 hover:bg-red-900/50 p-2 rounded-lg text-red-400">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <details className="mt-4 text-slate-400 text-xs">
                 <summary className="cursor-pointer hover:text-indigo-400">View Script</summary>
                 <div className="mt-2 p-2 bg-black/30 rounded border border-slate-800 max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {p.script}
                 </div>
              </details>
            </div>
          </div>
        ))}
        {projects.length === 0 && <div className="text-center text-slate-500 mt-20">No masterpieces yet.</div>}
      </div>
    </div>
  );

  const ProfileView = () => (
    <div className="flex flex-col min-h-screen bg-slate-950 pb-24 px-6 pt-12">
      <div className="text-center mb-8">
        <div className="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg shadow-indigo-500/30">
          <span className="text-3xl font-bold text-white">EU</span>
        </div>
        <h2 className="text-2xl font-bold text-white">{userProfile.name}</h2>
        <p className="text-indigo-400">{userProfile.role}</p>
      </div>

      <div className="space-y-4">
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300">Total Projects</span>
            <span className="text-white font-bold text-xl">{projects.length}</span>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300">XP Points</span>
            <span className="text-white font-bold text-xl">{userProfile.xp}</span>
        </div>
        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
            <span className="text-slate-300">Scholar Level</span>
            <span className="text-white font-bold text-xl">{userProfile.level}</span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="bg-black text-slate-100 font-sans min-h-screen selection:bg-indigo-500/30">
      {loading && <LoadingOverlay />}

      <main className="max-w-md mx-auto min-h-screen relative bg-slate-950 shadow-2xl overflow-hidden">
        {activeTab === 'home' && <HomeView />}
        {activeTab === 'create' && <CreateView />}
        {activeTab === 'projects' && <ProjectsView />}
        {activeTab === 'profile' && <ProfileView />}

        <div className="fixed bottom-0 left-0 right-0 z-40">
           <div className="max-w-md mx-auto bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 pb-safe pt-2 px-2 flex justify-around items-center h-20">
             <button onClick={() => setActiveTab('home')} className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${activeTab === 'home' ? 'text-indigo-400' : 'text-slate-500'}`}><Home className="w-6 h-6" /><span className="text-[10px] font-medium">Home</span></button>
             <button onClick={() => setActiveTab('projects')} className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${activeTab === 'projects' ? 'text-indigo-400' : 'text-slate-500'}`}><Layers className="w-6 h-6" /><span className="text-[10px] font-medium">Library</span></button>
             <div className="relative -top-6"><button onClick={() => { setActiveTab('create'); setWizardStep(1); }} className="bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-full shadow-lg shadow-indigo-600/40 transition-transform active:scale-95 border-4 border-slate-900"><PlusCircle className="w-7 h-7" /></button></div>
             <button onClick={() => setActiveTab('create')} className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${activeTab === 'create' ? 'text-indigo-400' : 'text-slate-500'}`}><Wand2 className="w-6 h-6" /><span className="text-[10px] font-medium">Create</span></button>
             <button onClick={() => setActiveTab('profile')} className={`p-2 rounded-xl flex flex-col items-center gap-1 transition-colors ${activeTab === 'profile' ? 'text-indigo-400' : 'text-slate-500'}`}><User className="w-6 h-6" /><span className="text-[10px] font-medium">Profile</span></button>
           </div>
        </div>
      </main>
    </div>
  );
}
