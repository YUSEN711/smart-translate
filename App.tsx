import React, { useState, useEffect, useRef } from 'react';
import { Mic, Square, Globe, Volume2, VolumeX, ArrowLeft, Loader2, Upload, FileAudio, Key, Sparkles, Activity, Flag, CheckCircle2, BookOpen, Lightbulb, ArrowRight, FileText, Download, ListChecks } from 'lucide-react';
import { AppView, TranscriptItem, IntervalAnalysis } from './types';
import { useGeminiLive } from './hooks/useGeminiLive';
import { generateClassSummary, analyzeAudioFile, generateIntervalAnalysis, generateStageSummary } from './services/geminiService';
import { blobToBase64 } from './utils/audioUtils';
import Visualizer from './components/Visualizer';
import TranscriptView from './components/TranscriptView';
import ReactMarkdown, { Components } from 'react-markdown';
import clsx from 'clsx';

const CHECKIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MILESTONE_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// Custom Markdown Components for the Summary View
const SummaryMarkdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl md:text-3xl font-bold text-slate-800 mb-6 pb-2 border-b-2 border-indigo-100 flex items-center gap-3">
      <BookOpen className="text-indigo-600" size={32} />
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-bold text-indigo-700 mt-8 mb-4 flex items-center gap-2">
      <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-slate-700 mt-6 mb-3">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-slate-600 leading-relaxed mb-4 text-base">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="grid grid-cols-1 gap-3 my-4">
      {children}
    </ul>
  ),
  li: ({ children }) => (
    <li className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex gap-3 items-start hover:shadow-md transition-shadow">
      <CheckCircle2 className="text-green-500 mt-0.5 shrink-0" size={18} />
      <div className="text-slate-700 leading-snug">{children}</div>
    </li>
  ),
  strong: ({ children }) => (
    <span className="font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md mx-0.5">
      {children}
    </span>
  ),
  blockquote: ({ children }) => (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 my-6 rounded-r-lg italic text-amber-900">
      {children}
    </div>
  )
};

// Simplified Components for Live Analysis Cards
const LiveCardMarkdownComponents: Components = {
    h1: ({ children }) => <div className="font-bold text-lg text-slate-800 mb-2">{children}</div>,
    h2: ({ children }) => <div className="font-semibold text-sm text-indigo-600 mt-2 mb-1 uppercase tracking-wider">{children}</div>,
    ul: ({ children }) => <ul className="space-y-2 mt-2">{children}</ul>,
    li: ({ children }) => (
        <li className="flex gap-2 items-start text-sm text-slate-700 bg-white/50 p-2 rounded-lg">
            <span className="text-indigo-500 mt-1">•</span>
            <span>{children}</span>
        </li>
    ),
    strong: ({ children }) => <span className="font-bold text-slate-900">{children}</span>,
    p: ({children}) => <p className="text-sm text-slate-600 mb-2 leading-relaxed">{children}</p>
};


const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.HOME);
  const [apiKey, setApiKey] = useState('');
  const [liveTab, setLiveTab] = useState<'transcript' | 'analysis'>('transcript');
  
  const [transcript, setTranscript] = useState<TranscriptItem[]>([]);
  const transcriptRef = useRef<TranscriptItem[]>([]); 
  
  const [intervalAnalyses, setIntervalAnalyses] = useState<IntervalAnalysis[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const [isAudioMuted, setIsAudioMuted] = useState(true);
  const [summaryData, setSummaryData] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  
  // Pending file state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync ref
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  const handleTranscriptUpdate = (newItem: TranscriptItem) => {
    setTranscript(prev => {
      const existingIndex = prev.findIndex(item => item.id === newItem.id);
      
      if (newItem.id === 'input-curr' || newItem.id === 'output-curr') {
          const filtered = prev.filter(i => i.id !== newItem.id);
          return [...filtered, newItem];
      }
      
      if (!newItem.isPartial) {
          const partialId = newItem.speaker === 'user' ? 'input-curr' : 'output-curr';
          const filtered = prev.filter(i => i.id !== partialId);
          return [...filtered, newItem];
      }

      return [...prev, newItem];
    });
  };

  const { connect, disconnect, isConnected, micVolume, error } = useGeminiLive({
    onTranscriptUpdate: handleTranscriptUpdate,
    isAudioMuted
  });

  // Watch for connection status changes to stop loading spinner
  useEffect(() => {
    if (isConnected || error) {
      setIsConnecting(false);
    }
  }, [isConnected, error]);

  // Periodic Analysis Logic
  useEffect(() => {
    let checkinInterval: ReturnType<typeof setInterval>;
    let milestoneInterval: ReturnType<typeof setInterval>;

    if (view === AppView.LIVE && isConnected) {
      const startTime = Date.now();
      
      // 5-Minute Check-in
      checkinInterval = setInterval(async () => {
        const currentTranscript = transcriptRef.current;
        if (currentTranscript.length === 0) return;
        
        const now = Date.now();
        const minsElapsed = Math.floor((now - startTime) / 60000);
        const label = `Minute ${Math.max(0, minsElapsed - 5)} - ${minsElapsed}`;
        
        try {
           const analysisText = await generateIntervalAnalysis(currentTranscript, apiKey, label);
           setIntervalAnalyses(prev => [
             ...prev, 
             {
               id: `checkin-${now}`,
               timestamp: now,
               content: analysisText,
               timeRange: label,
               type: 'check-in'
             }
           ]);
        } catch (e) {
          console.error("Check-in analysis failed", e);
        }
      }, CHECKIN_INTERVAL_MS);

      // 15-Minute Milestone
      milestoneInterval = setInterval(async () => {
        const currentTranscript = transcriptRef.current;
        if (currentTranscript.length === 0) return;

        const now = Date.now();
        const minsElapsed = Math.floor((now - startTime) / 60000);
        const label = `First ${minsElapsed} Minutes`;

        try {
            const summaryText = await generateStageSummary(currentTranscript, apiKey, label);
            setIntervalAnalyses(prev => [
                ...prev,
                {
                    id: `milestone-${now}`,
                    timestamp: now,
                    content: summaryText,
                    timeRange: `STAGE SUMMARY: ${label}`,
                    type: 'milestone'
                }
            ]);
        } catch (e) {
            console.error("Milestone summary failed", e);
        }
      }, MILESTONE_INTERVAL_MS);
    }

    return () => {
      if (checkinInterval) clearInterval(checkinInterval);
      if (milestoneInterval) clearInterval(milestoneInterval);
    };
  }, [view, isConnected, apiKey]);

  const startSession = () => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      alert("Please enter your API Key first.");
      return;
    }
    setTranscript([]);
    setIntervalAnalyses([]);
    setSummaryData('');
    setPendingFile(null); // Ensure no file state is lingering
    setIsConnecting(true);
    setView(AppView.LIVE);
    setLiveTab('transcript');
    connect(trimmedKey);
  };

  const endSession = async () => {
    disconnect();
    setIsGeneratingSummary(true);
    setView(AppView.SUMMARY);
    
    const summary = await generateClassSummary(transcript, apiKey);
    setSummaryData(summary);
    setIsGeneratingSummary(false);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      alert("Please enter your API Key first.");
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
        alert("File is too large. Please select a file under 20MB.");
        return;
    }

    setPendingFile(file);
    setView(AppView.FILE_OPTIONS);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleProcessFile = async (mode: 'transcript' | 'summary') => {
    if (!pendingFile || !apiKey) return;
    
    setIsProcessingFile(true);
    setView(AppView.SUMMARY);
    setSummaryData('');

    try {
        const base64 = await blobToBase64(pendingFile);
        const mimeType = pendingFile.type || 'audio/mp3';
        const result = await analyzeAudioFile(base64, mimeType, apiKey, mode);
        setSummaryData(result);
    } catch (e) {
        console.error(e);
        setSummaryData("Error processing file.");
    } finally {
        setIsProcessingFile(false);
        // NOTE: Do not clear pendingFile here so we can go "Back" to options
    }
  };

  const triggerFileUpload = () => {
    if (!apiKey.trim()) {
        alert("Please enter your API Key first.");
        return;
    }
    fileInputRef.current?.click();
  };

  const handleExport = () => {
      if (!summaryData) return;
      const blob = new Blob([summaryData], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `SmartTranslate_${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  const handleSummaryBack = () => {
    if (pendingFile) {
        setView(AppView.FILE_OPTIONS);
    } else {
        setView(AppView.HOME);
    }
  };

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return (
    <div className="h-full flex flex-col bg-slate-50 w-full mx-auto overflow-hidden relative font-sans text-slate-900">
      
      {/* HOME VIEW */}
      {view === AppView.HOME && (
        <div className="flex flex-col h-full items-center justify-center p-8 text-center space-y-8 bg-gradient-to-b from-blue-50 to-white overflow-y-auto">
          <div className="space-y-2">
            <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-indigo-200">
               <Sparkles className="text-white w-10 h-10" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-800 tracking-tight">Smart Translate</h1>
            <p className="text-slate-500 text-lg max-w-md mx-auto">
              Real-time translation with periodic long-context analysis.
            </p>
          </div>

          <div className="w-full max-w-md">
             <label className="block text-left text-sm font-medium text-slate-700 mb-1">
                Enter your Gemini API Key
             </label>
             <div className="relative">
                 <input 
                   type="password" 
                   value={apiKey}
                   onChange={(e) => setApiKey(e.target.value)}
                   placeholder="AIzaSy..."
                   className="w-full p-4 pl-12 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-all"
                 />
                 <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
             </div>
             <p className="text-xs text-slate-400 mt-2 text-left">
               Your key is used locally for this session only.
             </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full max-w-xl pt-4">
            <button 
                onClick={startSession}
                disabled={!apiKey || isConnecting}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-4 rounded-xl shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                {isConnecting ? <Loader2 className="animate-spin" size={20} /> : <Mic size={20} />}
                {isConnecting ? "Connecting..." : "Start Live"}
            </button>

            <button 
                onClick={triggerFileUpload}
                disabled={!apiKey}
                className="flex-1 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 border border-slate-200 font-semibold py-4 rounded-xl shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                <Upload size={20} />
                Upload File
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="audio/*"
                onChange={handleFileSelect}
            />
          </div>
          
          <div className="mt-8 text-xs text-slate-400 flex flex-col items-center gap-1">
             <p>Powered by Gemini 2.5 Live & 3.0 Pro</p>
             <p className="bg-orange-100 text-orange-600 px-2 py-1 rounded-full border border-orange-200">
                Auto-analysis every 5 & 15 mins
             </p>
          </div>
        </div>
      )}

      {/* FILE OPTIONS VIEW */}
      {view === AppView.FILE_OPTIONS && pendingFile && (
         <div className="flex flex-col h-full items-center justify-center p-8 bg-gradient-to-b from-slate-50 to-white">
            <button onClick={() => { setView(AppView.HOME); setPendingFile(null); }} className="absolute top-6 left-6 p-2 bg-white rounded-full hover:bg-slate-100 border border-slate-200 shadow-sm transition-colors">
                 <ArrowLeft size={24} className="text-slate-600" />
            </button>
            
            <div className="text-center mb-10 animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <FileAudio size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Analyze Audio File</h2>
                <p className="text-slate-500">{pendingFile.name}</p>
                <p className="text-xs text-slate-400 mt-1">{(pendingFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
                <button 
                    onClick={() => handleProcessFile('transcript')}
                    className="group bg-white p-8 rounded-2xl border-2 border-slate-100 hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left"
                >
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        <FileText size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">逐字稿 (Transcript)</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                        Get a verbatim transcript of the audio content, suitable for detailed review.
                    </p>
                </button>

                <button 
                    onClick={() => handleProcessFile('summary')}
                    className="group bg-white p-8 rounded-2xl border-2 border-slate-100 hover:border-amber-500 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left"
                >
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center mb-4 group-hover:bg-amber-500 group-hover:text-white transition-colors">
                        <ListChecks size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">重點整理 (Key Points)</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                         Generate an AI-structured study guide with summary, key points, and terminology.
                    </p>
                </button>
            </div>
         </div>
      )}

      {/* LIVE VIEW */}
      {view === AppView.LIVE && (
        <div className="flex flex-col h-full bg-white">
          {/* Header */}
          <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-full border border-red-100">
                     <span className="relative flex h-2.5 w-2.5">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                     </span>
                     <span className="text-xs font-bold uppercase tracking-wider">Live</span>
                 </div>
                 <div className="hidden md:block h-6 w-px bg-slate-200"></div>
                 <h2 className="hidden md:block font-semibold text-slate-700">Classroom Session</h2>
             </div>

             {/* Mobile Tabs */}
             <div className="flex md:hidden bg-slate-100 p-1 rounded-lg">
               <button 
                  onClick={() => setLiveTab('transcript')}
                  className={clsx(
                    "px-4 py-1.5 text-xs font-medium rounded-md transition-all",
                    liveTab === 'transcript' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
               >
                 Transcript
               </button>
               <button 
                  onClick={() => setLiveTab('analysis')}
                  className={clsx(
                    "px-4 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1",
                    liveTab === 'analysis' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                  )}
               >
                 Analysis
                 {intervalAnalyses.length > 0 && (
                   <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                 )}
               </button>
             </div>
             
             {/* Right Controls */}
             <div className="flex gap-2">
                 <button 
                    onClick={() => setIsAudioMuted(!isAudioMuted)}
                    className="p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                    title={isAudioMuted ? "Unmute Translation" : "Mute Translation"}
                 >
                    {isAudioMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                 </button>
             </div>
          </div>

          {/* Main Content Area: Responsive Split View */}
          <div className="flex-1 overflow-hidden relative flex flex-col md:flex-row bg-slate-50">
            
            {/* Left/Main Column: Transcript */}
            <div className={clsx(
                "flex-1 relative flex flex-col h-full overflow-hidden transition-all duration-300",
                // Mobile: Only show if tab active. Desktop: Always show.
                liveTab === 'transcript' ? "flex" : "hidden md:flex"
            )}>
                 <div className="flex-1 h-full flex flex-col relative bg-white md:m-4 md:rounded-2xl md:shadow-sm md:border md:border-slate-100 overflow-hidden">
                      <TranscriptView items={transcript} />
                 </div>
            </div>

            {/* Right/Sidebar Column: Analysis */}
            <div className={clsx(
                "h-full overflow-hidden flex flex-col bg-slate-50 md:bg-white md:border-l border-slate-200 transition-all",
                // CHANGED: Use REM instead of fixed pixels to respect root font scaling
                "w-full md:w-[26rem] lg:w-[32rem] xl:w-[36rem]", 
                liveTab === 'analysis' ? "flex" : "hidden md:flex"
            )}>
                  <div className="px-5 py-4 border-b border-slate-100 bg-white/50 backdrop-blur-sm sticky top-0 z-10 hidden md:flex items-center justify-between">
                       <h3 className="font-semibold text-slate-700 flex items-center gap-2">
                          <Sparkles size={18} className="text-indigo-500"/>
                          Real-time Insights
                       </h3>
                       <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-100 font-medium">
                          Auto-updates every 5m
                       </span>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-hide pb-32 md:pb-8 bg-slate-50/50">
                       {intervalAnalyses.length === 0 ? (
                         <div className="flex flex-col items-center justify-center h-64 text-slate-400 text-center p-4 border-2 border-dashed border-slate-200 rounded-xl m-2">
                            <Activity size={32} className="mb-3 opacity-50 text-indigo-300"/>
                            <p className="font-medium text-slate-500">Waiting for first analysis...</p>
                            <p className="text-xs mt-1">AI generates insights every 5 minutes.</p>
                         </div>
                       ) : (
                         intervalAnalyses.slice().reverse().map((analysis) => (
                           <div 
                             key={analysis.id} 
                             className={clsx(
                                 "p-5 rounded-xl border shadow-sm transition-all hover:shadow-md",
                                 analysis.type === 'milestone' 
                                    ? "bg-gradient-to-br from-amber-50 to-orange-50/50 border-amber-200/60" 
                                    : "bg-white border-slate-200/60"
                             )}
                           >
                              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-black/5">
                                 {analysis.type === 'milestone' ? (
                                     <div className="p-1.5 bg-amber-100 rounded-lg">
                                        <Flag size={14} className="text-amber-700" />
                                     </div>
                                 ) : (
                                     <div className="p-1.5 bg-indigo-100 rounded-lg">
                                        <Lightbulb size={14} className="text-indigo-600" />
                                     </div>
                                 )}
                                 <span className={clsx(
                                     "text-xs font-bold uppercase tracking-wide",
                                     analysis.type === 'milestone' ? "text-amber-800" : "text-slate-500"
                                 )}>
                                     {analysis.timeRange}
                                 </span>
                              </div>
                              
                              <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-2">
                                 <ReactMarkdown components={LiveCardMarkdownComponents}>
                                     {analysis.content}
                                 </ReactMarkdown>
                              </div>
                           </div>
                         ))
                       )}
                  </div>
            </div>
          </div>

          {/* Footer Controls */}
          <div className="bg-white border-t border-slate-200 p-4 z-30 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
             <div className="max-w-4xl mx-auto w-full">
                  <Visualizer volume={micVolume} />
                  <div className="flex justify-center mt-4">
                      <button 
                        onClick={endSession}
                        className="w-full max-w-sm bg-red-500 hover:bg-red-600 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-red-100"
                      >
                        <Square size={18} fill="currentColor" />
                        End & Final Summary
                      </button>
                  </div>
             </div>
          </div>
          
          {error && (
             <div className="absolute top-20 left-1/2 -translate-x-1/2 max-w-md w-full px-4 z-50">
                 <div className="bg-red-50 text-red-600 p-4 rounded-xl text-sm border border-red-200 shadow-xl flex flex-col items-center animate-in fade-in slide-in-from-top-4">
                     <p className="font-semibold mb-1">Connection Error</p>
                     <p>{error}</p>
                     <button onClick={() => setView(AppView.HOME)} className="mt-3 text-xs bg-white border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">Return Home</button>
                 </div>
             </div>
          )}
        </div>
      )}

      {/* FINAL SUMMARY VIEW */}
      {view === AppView.SUMMARY && (
        <div className="flex flex-col h-full bg-white">
           <div className="border-b border-slate-100 p-4 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur-sm z-10 shadow-sm px-4 md:px-8">
               <div className="flex items-center gap-4">
                   <button onClick={handleSummaryBack} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                       <ArrowLeft size={20} className="text-slate-600" />
                   </button>
                   <h2 className="font-bold text-lg text-slate-800">
                       {isProcessingFile ? 'Processing Audio...' : 'Analysis Result'}
                   </h2>
               </div>
               
               {!isProcessingFile && !isGeneratingSummary && summaryData && (
                  <button 
                    onClick={handleExport}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-md shadow-indigo-100"
                  >
                     <Download size={16} />
                     <span className="hidden md:inline">Export Markdown</span>
                  </button>
               )}
           </div>

           <div className="flex-1 overflow-y-auto p-4 md:p-10 scrollbar-hide bg-slate-50/50">
               {(isGeneratingSummary || isProcessingFile) ? (
                   <div className="flex flex-col items-center justify-center h-full space-y-6">
                       <div className="relative">
                           <div className="absolute inset-0 bg-indigo-200 rounded-full animate-ping opacity-20"></div>
                           <Loader2 size={48} className="animate-spin text-indigo-600 relative z-10" />
                       </div>
                       <div className="text-center space-y-2">
                           <p className="text-lg text-slate-700 font-semibold">
                               {isProcessingFile ? "Analyzing Audio Content..." : "Generating Final Report..."}
                           </p>
                           <p className="text-sm text-slate-500">
                               Powered by Gemini 2.0 Multimodal
                           </p>
                       </div>
                   </div>
               ) : (
                   <div className="max-w-4xl mx-auto bg-white p-8 md:p-16 rounded-2xl shadow-sm border border-slate-100 min-h-[500px]">
                       <div className="mb-10 pb-6 border-b border-slate-100 flex flex-col md:flex-row md:items-end justify-between gap-4">
                          <div>
                              <p className="text-sm text-indigo-500 font-bold uppercase tracking-wider mb-2">Class Report</p>
                              <h1 className="text-3xl font-bold text-slate-900">Study Guide & Summary</h1>
                          </div>
                          <p className="text-sm text-slate-400 font-medium">{new Date().toLocaleDateString()}</p>
                       </div>
                       
                       {/* Rich Markdown Display */}
                       <div className="prose prose-slate prose-lg max-w-none">
                           <ReactMarkdown components={SummaryMarkdownComponents}>
                               {summaryData}
                           </ReactMarkdown>
                       </div>
                   </div>
               )}
           </div>
           
           <div className="p-4 border-t border-slate-100 bg-white z-20">
               <div className="max-w-xl mx-auto">
                   <button 
                    onClick={() => {
                        setPendingFile(null); // Explicitly clear file state when finishing session
                        setView(AppView.HOME);
                    }}
                    className="w-full bg-slate-900 text-white font-semibold py-3 rounded-xl shadow-lg hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
                   >
                       Start New Session <ArrowRight size={18} />
                   </button>
               </div>
           </div>
        </div>
      )}

    </div>
  );
};

export default App;