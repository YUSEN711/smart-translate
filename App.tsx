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
    <h1 className="text-3xl md:text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-8 pb-4 border-b-2 border-indigo-100 flex items-center gap-3">
      <BookOpen className="text-indigo-600" size={36} />
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl md:text-2xl font-bold text-slate-800 mt-10 mb-6 flex items-center gap-3">
      <div className="w-2 h-8 bg-gradient-to-b from-indigo-500 to-purple-600 rounded-full shadow-sm"></div>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-bold text-indigo-900 mt-8 mb-4">
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p className="text-slate-600 leading-relaxed mb-6 text-base md:text-lg">
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul className="grid grid-cols-1 gap-4 my-6">
      {children}
    </ul>
  ),
  li: ({ children }) => (
    <li className="bg-white/50 backdrop-blur-sm p-5 rounded-2xl border border-white/50 shadow-sm hover:shadow-md transition-all duration-300 flex gap-4 items-start">
      <div className="bg-green-100 p-1 rounded-full shrink-0 mt-0.5">
        <CheckCircle2 className="text-green-600" size={16} />
      </div>
      <div className="text-slate-700 leading-snug font-medium">{children}</div>
    </li>
  ),
  strong: ({ children }) => (
    <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg mx-0.5 border border-indigo-100/50">
      {children}
    </span>
  ),
  blockquote: ({ children }) => (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-400 p-6 my-8 rounded-r-2xl italic text-amber-900 shadow-sm">
      <span className="text-2xl text-amber-300 block mb-2">"</span>
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
  p: ({ children }) => <p className="text-sm text-slate-600 mb-2 leading-relaxed">{children}</p>
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
    <div className="h-full flex flex-col bg-gradient-to-br from-indigo-50 via-white to-purple-50 w-full mx-auto overflow-hidden relative font-sans text-slate-900 selection:bg-indigo-100 selection:text-indigo-900">

      {/* HOME VIEW */}
      {view === AppView.HOME && (
        <div className="flex flex-col h-full items-center justify-center p-8 text-center space-y-10 overflow-y-auto">
          <div className="space-y-4 animate-in fade-in zoom-in duration-500 slide-in-from-bottom-4">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-indigo-300 ring-4 ring-white/50 backdrop-blur-sm">
              <Sparkles className="text-white w-12 h-12" />
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 tracking-tight pb-2">
              Smart Translate
            </h1>
            <p className="text-slate-500 text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
              Experience the future of learning with <span className="text-indigo-600 font-semibold">real-time translation</span> and intelligent context analysis.
            </p>
          </div>

          <div className="w-full max-w-md bg-white/60 backdrop-blur-xl p-8 rounded-3xl border border-white/40 shadow-xl ring-1 ring-white/60 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
            <label className="block text-left text-sm font-semibold text-slate-700 mb-2 ml-1">
              Gemini API Key
            </label>
            <div className="relative group">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key..."
                className="w-full p-4 pl-12 rounded-2xl border border-slate-200 bg-white/50 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 shadow-sm transition-all duration-300"
              />
              <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
            </div>
            <p className="text-xs text-slate-400 mt-3 text-left pl-1">
              Your key is stored locally for this session.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-4 w-full max-w-xl pt-2 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            <button
              onClick={startSession}
              disabled={!apiKey || isConnecting}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl shadow-xl shadow-indigo-200 hover:shadow-2xl hover:shadow-indigo-300 hover:-translate-y-1 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3"
            >
              {isConnecting ? <Loader2 className="animate-spin" size={24} /> : <Mic size={24} />}
              <span className="text-lg">{isConnecting ? "Connecting..." : "Start Live Session"}</span>
            </button>

            <button
              onClick={triggerFileUpload}
              disabled={!apiKey}
              className="flex-1 bg-white hover:bg-slate-50 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 border border-slate-200 font-bold py-4 rounded-2xl shadow-lg hover:shadow-xl hover:-translate-y-1 active:scale-95 transition-all duration-300 flex items-center justify-center gap-3"
            >
              <Upload size={24} className="text-indigo-500" />
              <span className="text-lg">Upload Audio</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="audio/*"
              onChange={handleFileSelect}
            />
          </div>

          <div className="mt-auto text-xs text-slate-400 flex flex-col items-center gap-2 animate-in fade-in delay-500">
            <div className="flex items-center gap-2 text-slate-500">
              <Sparkles size={12} className="text-indigo-400" />
              Powered by Gemini 2.5 Live & 3.0 Pro
            </div>
            <p className="bg-indigo-50/50 text-indigo-600/80 px-3 py-1 rounded-full border border-indigo-100/50 backdrop-blur-sm">
              Auto-analysis every 5 & 15 mins
            </p>
          </div>
        </div>
      )}

      {/* FILE OPTIONS VIEW */}
      {view === AppView.FILE_OPTIONS && pendingFile && (
        <div className="flex flex-col h-full items-center justify-center p-8 bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
          <button onClick={() => { setView(AppView.HOME); setPendingFile(null); }} className="absolute top-8 left-8 p-3 bg-white/80 backdrop-blur-sm rounded-full hover:bg-white border border-white/50 shadow-sm hover:shadow-md transition-all group">
            <ArrowLeft size={24} className="text-slate-600 group-hover:text-slate-900" />
          </button>

          <div className="text-center mb-12 animate-in fade-in zoom-in duration-500">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-100 to-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-lg ring-4 ring-white">
              <FileAudio size={40} />
            </div>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">{pendingFile.name}</h2>
            <p className="text-sm font-medium text-slate-500 bg-slate-100/50 px-3 py-1 rounded-full inline-block border border-slate-200/50">
              {(pendingFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl px-4">
            <button
              onClick={() => handleProcessFile('transcript')}
              className="group bg-white/70 backdrop-blur-md p-8 rounded-3xl border border-white/60 shadow-xl hover:shadow-2xl hover:border-indigo-200 hover:-translate-y-1 active:scale-95 transition-all duration-300 text-left relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 to-indigo-50/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300 shadow-sm">
                  <FileText size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3 group-hover:text-indigo-700 transition-colors">Verbatim Transcript</h3>
                <p className="text-slate-500 leading-relaxed font-medium">
                  Get a precise word-for-word transcript. Perfect for detailed review, quoting, and accessibility.
                </p>
              </div>
            </button>

            <button
              onClick={() => handleProcessFile('summary')}
              className="group bg-white/70 backdrop-blur-md p-8 rounded-3xl border border-white/60 shadow-xl hover:shadow-2xl hover:border-amber-200 hover:-translate-y-1 active:scale-95 transition-all duration-300 text-left relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-amber-50/0 to-amber-50/50 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="relative z-10">
                <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mb-5 group-hover:bg-amber-500 group-hover:text-white transition-colors duration-300 shadow-sm">
                  <ListChecks size={28} />
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-3 group-hover:text-amber-700 transition-colors">Study Guide</h3>
                <p className="text-slate-500 leading-relaxed font-medium">
                  AI-generated summary with key points and terminology. Best for quick learning and revision.
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* LIVE VIEW */}
      {view === AppView.LIVE && (
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="bg-white/80 backdrop-blur-md border-b border-indigo-100 px-4 md:px-8 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-1.5 bg-red-50 text-red-600 rounded-full border border-red-100 shadow-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider">Live Session</span>
              </div>
              <h2 className="hidden md:block font-bold text-slate-700">Classroom Mode</h2>
            </div>

            {/* Mobile Tabs */}
            <div className="flex md:hidden bg-slate-100/80 p-1 rounded-xl">
              <button
                onClick={() => setLiveTab('transcript')}
                className={clsx(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all",
                  liveTab === 'transcript' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                )}
              >
                Transcript
              </button>
              <button
                onClick={() => setLiveTab('analysis')}
                className={clsx(
                  "px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1",
                  liveTab === 'analysis' ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
                )}
              >
                Insights
                {intervalAnalyses.length > 0 && (
                  <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span>
                )}
              </button>
            </div>

            {/* Right Controls */}
            <div className="flex gap-2">
              <button
                onClick={() => setIsAudioMuted(!isAudioMuted)}
                className="p-2.5 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200 transition-all hover:scale-105 active:scale-95"
                title={isAudioMuted ? "Unmute Translation" : "Mute Translation"}
              >
                {isAudioMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
            </div>
          </div>

          {/* Main Content Area: Responsive Split View */}
          <div className="flex-1 overflow-hidden relative flex flex-col md:flex-row">

            {/* Left/Main Column: Transcript */}
            <div className={clsx(
              "flex-1 relative flex flex-col h-full overflow-hidden transition-all duration-300",
              liveTab === 'transcript' ? "flex" : "hidden md:flex"
            )}>
              <div className="flex-1 h-full flex flex-col relative overflow-hidden bg-transparent">
                <TranscriptView items={transcript} />
              </div>
            </div>

            {/* Right/Sidebar Column: Analysis */}
            <div className={clsx(
              "h-full overflow-hidden flex flex-col bg-white/50 border-l border-indigo-50/50 backdrop-blur-md transition-all shadow-xl",
              "w-full md:w-[28rem] lg:w-[32rem] xl:w-[36rem]",
              liveTab === 'analysis' ? "flex" : "hidden md:flex"
            )}>
              <div className="px-6 py-4 border-b border-indigo-50 bg-white/40 sticky top-0 z-10 hidden md:flex items-center justify-between">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <Sparkles size={18} className="text-indigo-500 fill-indigo-100" />
                  AI Insights
                </h3>
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full border border-indigo-100 font-bold tracking-wide uppercase">
                  Values update every 5m
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-hide pb-32 md:pb-8">
                {intervalAnalyses.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-400 text-center p-8">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm border border-slate-100">
                      <Activity size={32} className="text-indigo-200" />
                    </div>
                    <p className="font-semibold text-slate-600">Collecting context...</p>
                    <p className="text-sm mt-1 max-w-[200px]">The AI is listening and will generate the first insight in a few minutes.</p>
                  </div>
                ) : (
                  intervalAnalyses.slice().reverse().map((analysis) => (
                    <div
                      key={analysis.id}
                      className={clsx(
                        "p-6 rounded-2xl border transition-all duration-300 hover:shadow-lg group",
                        analysis.type === 'milestone'
                          ? "bg-gradient-to-br from-amber-50/80 to-orange-50/80 border-amber-100 shadow-amber-100/50"
                          : "bg-white/80 border-white/60 shadow-sm hover:border-indigo-100"
                      )}
                    >
                      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-black/5">
                        {analysis.type === 'milestone' ? (
                          <div className="p-2 bg-amber-100 rounded-xl shadow-inner">
                            <Flag size={16} className="text-amber-700" />
                          </div>
                        ) : (
                          <div className="p-2 bg-indigo-100 rounded-xl shadow-inner">
                            <Lightbulb size={16} className="text-indigo-600" />
                          </div>
                        )}
                        <span className={clsx(
                          "text-xs font-bold uppercase tracking-wider",
                          analysis.type === 'milestone' ? "text-amber-800" : "text-slate-500"
                        )}>
                          {analysis.timeRange}
                        </span>
                      </div>

                      <div className="text-sm prose prose-sm max-w-none prose-p:text-slate-600 prose-headings:font-bold prose-headings:text-slate-800">
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
          <div className="bg-white/90 backdrop-blur-xl border-t border-indigo-50 p-6 z-30 shadow-[0_-10px_60px_-15px_rgba(79,70,229,0.1)]">
            <div className="max-w-4xl mx-auto w-full space-y-6">
              <Visualizer volume={micVolume} />
              <div className="flex justify-center">
                <button
                  onClick={endSession}
                  className="w-full max-w-sm bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 active:scale-95 transition-all shadow-lg shadow-red-200"
                >
                  <Square size={20} fill="currentColor" />
                  End Session & View Summary
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="absolute top-24 left-1/2 -translate-x-1/2 max-w-md w-full px-4 z-50 animate-in slide-in-from-top-4 fade-in duration-300">
              <div className="bg-white/95 backdrop-blur-md text-red-600 p-6 rounded-2xl text-sm border border-red-100 shadow-2xl flex flex-col items-center">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center mb-3">
                  <Activity size={20} />
                </div>
                <p className="font-bold text-lg mb-1 text-slate-800">Connection Error</p>
                <p className="text-center text-slate-500 mb-4">{error}</p>
                <button onClick={() => setView(AppView.HOME)} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl transition-colors">Return Home</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FINAL SUMMARY VIEW */}
      {view === AppView.SUMMARY && (
        <div className="flex flex-col h-full">
          <div className="border-b border-indigo-50/50 p-4 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur-md z-10 shadow-sm px-4 md:px-8">
            <div className="flex items-center gap-4">
              <button onClick={handleSummaryBack} className="p-2.5 bg-white hover:bg-slate-50 border border-slate-100 rounded-full transition-all shadow-sm hover:shadow-md">
                <ArrowLeft size={20} className="text-slate-600" />
              </button>
              <h2 className="font-bold text-lg text-slate-800">
                {isProcessingFile ? 'Analyzing Audio...' : 'Class Summary'}
              </h2>
            </div>

            {!isProcessingFile && !isGeneratingSummary && summaryData && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-95"
              >
                <Download size={18} />
                <span className="hidden md:inline">Export PDF/MD</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide bg-slate-50/50">
            {(isGeneratingSummary || isProcessingFile) ? (
              <div className="flex flex-col items-center justify-center h-full space-y-8 animate-in fade-in zoom-in duration-500">
                <div className="relative">
                  <div className="absolute inset-0 bg-indigo-500 rounded-full animate-ping opacity-20 duration-1000"></div>
                  <div className="relative z-10 bg-white p-4 rounded-full shadow-xl ring-1 ring-indigo-50">
                    <Loader2 size={40} className="animate-spin text-indigo-600" />
                  </div>
                </div>
                <div className="text-center space-y-3">
                  <h3 className="text-2xl font-bold text-slate-800">
                    {isProcessingFile ? "Analyzing Audio Content" : "Synthesizing Knowledge"}
                  </h3>
                  <p className="text-slate-500 max-w-xs mx-auto leading-relaxed">
                    Our AI is discovering key points, summarizing topics, and formatting your study guide.
                  </p>
                </div>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto bg-white p-8 md:p-16 rounded-[2.5rem] shadow-xl shadow-indigo-100 border border-white ring-1 ring-black/5 min-h-[600px] animate-in slide-in-from-bottom-8 fade-in duration-700">
                <div className="mb-12 pb-8 border-b-2 border-slate-50 flex flex-col md:flex-row md:items-end justify-between gap-6">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm shadow-indigo-200">Final Report</span>
                    </div>
                    <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight">Study Guide</h1>
                  </div>
                  <div className="flex flex-col items-end">
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Generated On</p>
                    <p className="text-lg font-medium text-slate-700">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>

                {/* Rich Markdown Display */}
                <div className="prose prose-lg prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-600 prose-a:text-indigo-600 hover:prose-a:text-indigo-700">
                  <ReactMarkdown components={SummaryMarkdownComponents}>
                    {summaryData}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>

          {!isGeneratingSummary && !isProcessingFile && (
            <div className="p-6 border-t border-indigo-50 bg-white/90 backdrop-blur-xl z-20">
              <div className="max-w-xl mx-auto">
                <button
                  onClick={() => {
                    setPendingFile(null);
                    setView(AppView.HOME);
                  }}
                  className="w-full bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white font-bold py-4 rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:-translate-y-1 active:scale-95 flex items-center justify-center gap-3"
                >
                  <span>Start New Session</span>
                  <ArrowRight size={20} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default App;