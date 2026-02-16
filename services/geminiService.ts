import { GoogleGenAI } from "@google/genai";
import { TranscriptItem } from "../types";

// Helper to init AI with user key
const getAI = (apiKey: string) => new GoogleGenAI({ apiKey });

export const generateClassSummary = async (transcript: TranscriptItem[], apiKey: string): Promise<string> => {
  if (!apiKey) return "Error: API Key is missing.";

  const ai = getAI(apiKey);

  const cleanTranscript = transcript
    .filter(t => t.text.trim().length > 2)
    .map(t => `${t.speaker === 'user' ? 'Source' : 'Translator'}: ${t.text}`)
    .join('\n');

  const prompt = `
    Based on the following full transcript, please generate a comprehensive final study guide in Traditional Chinese (繁體中文).
    
    Structure your response using Markdown strictly as follows:
    
    # 課堂總結 (Executive Summary)
    [Provide a summary paragraph]

    # 重點回顧 (Key Takeaways)
    * [Key point 1]
    * [Key point 2]
    * [Key point 3]
    * [Key point 4]

    # 專有名詞 (Terminology)
    * **[Term 1]**: [Definition]
    * **[Term 2]**: [Definition]

    # 後續行動 (Action Items)
    * [Action 1]
    * [Action 2]

    Transcript:
    ${cleanTranscript}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview', // Using Pro for better context handling
      contents: prompt,
      config: {
        thinkingConfig: { thinkingBudget: 1024 },
      }
    });
    return response.text || "No summary generated.";
  } catch (error) {
    console.error("Summary generation failed:", error);
    return "Failed to generate summary.";
  }
};

export const generateIntervalAnalysis = async (transcript: TranscriptItem[], apiKey: string, timeRangeLabel: string): Promise<string> => {
  if (!apiKey) return "Error: API Key missing";
  if (transcript.length < 5) return "Not enough content to analyze yet.";

  const ai = getAI(apiKey);

  const context = transcript
    .slice(-50) // Optimize: Only send recent context for the 5-min check-in to be fast
    .map(t => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.speaker}: ${t.text}`)
    .join('\n');

  const prompt = `
    You are an intelligent analyst assistant. 
    Analyze the recent transcript (Time: ${timeRangeLabel}).
    
    Provide a concise "Pulse Check" in Traditional Chinese (繁體中文).
    Use the following format exactly:
    
    # 目前主題 (Current Topic)
    [One sentence summary]

    # 最新重點 (Key Insights)
    * [Insight 1]
    * [Insight 2]
    
    Recent Context:
    ${context}
  `;

  try {
     const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Use Flash for faster 5-min updates
      contents: prompt
    });
    return response.text || "Analysis unavailable.";
  } catch (error) {
    console.error("Interval analysis failed", error);
    return "Analysis failed.";
  }
};

export const generateStageSummary = async (transcript: TranscriptItem[], apiKey: string, timeRangeLabel: string): Promise<string> => {
    if (!apiKey) return "Error: API Key missing";
  
    const ai = getAI(apiKey);
  
    // For the 15-minute summary, we send everything to Pro
    const context = transcript
      .map(t => `[${new Date(t.timestamp).toLocaleTimeString()}] ${t.speaker}: ${t.text}`)
      .join('\n');
  
    const prompt = `
      You are an expert academic summarizer.
      Analyze the transcript so far (${timeRangeLabel}).
      
      Create a "Stage Summary" (階段重點彙整) in Traditional Chinese (繁體中文).
      
      # 學習軌跡 (Learning Path)
      [Brief paragraph on the flow of the lecture]

      # 核心觀念 (Core Concepts)
      * **[Concept 1]**: [Explanation]
      * **[Concept 2]**: [Explanation]
      * **[Concept 3]**: [Explanation]

      # 階段結論 (Conclusion)
      [Brief conclusion]
      
      Full Transcript:
      ${context}
    `;
  
    try {
       const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: prompt
      });
      return response.text || "Stage summary unavailable.";
    } catch (error) {
      console.error("Stage summary failed", error);
      return "Stage summary failed.";
    }
  };

export const analyzeAudioFile = async (base64Audio: string, mimeType: string, apiKey: string, mode: 'transcript' | 'summary' = 'summary'): Promise<string> => {
    if (!apiKey) return "Error: API Key is missing.";

    const ai = getAI(apiKey);

    let prompt = '';

    if (mode === 'transcript') {
        prompt = `
          You are a professional transcriber. 
          Task: Listen to the attached audio and provide a highly accurate, verbatim transcript.
          
          Language rules:
          - If the audio is in a foreign language (English, Japanese, etc.), transcribe it and then provide a Traditional Chinese (繁體中文) translation for each section.
          - If the audio is already in Chinese, just provide the Traditional Chinese transcript.
          
          Format: 
          Use clear paragraph breaks. Label speakers if possible.
          
          Start with a Title: "# Audio Transcript / 錄音逐字稿"
        `;
    } else {
        prompt = `
          You are Smart Translate. Analyze the attached audio file.
          
          Generate a comprehensive study guide in Traditional Chinese (繁體中文) using this Markdown format:

          # 內容摘要 (Summary)
          [Overview paragraph]

          # 重點整理 (Key Points)
          * [Point 1]
          * [Point 2]
          * [Point 3]

          # 詳細筆記 (Detailed Notes)
          * **[Topic]**: [Details]
          * **[Topic]**: [Details]
        `;
    }

    try {
        const response = await ai.models.generateContent({
            // Using 'gemini-2.0-flash' as requested to support audio file analysis
            model: 'gemini-2.0-flash', 
            contents: {
                parts: [
                    { inlineData: { mimeType: mimeType, data: base64Audio } },
                    { text: prompt }
                ]
            }
        });
        return response.text || "Could not analyze audio file.";
    } catch (error) {
        console.error("Audio analysis failed:", error);
        return `Failed to analyze audio file. Error: ${error instanceof Error ? error.message : String(error)}`;
    }
};