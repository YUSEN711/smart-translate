import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { createPcmBlob, base64ToUint8Array, decodeAudioData } from '../utils/audioUtils';
import { TranscriptItem } from '../types';

interface UseGeminiLiveProps {
  onTranscriptUpdate: (item: TranscriptItem) => void;
  isAudioMuted: boolean;
}

export const useGeminiLive = ({ onTranscriptUpdate, isAudioMuted }: UseGeminiLiveProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState(0);

  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  
  const currentInputTransRef = useRef<string>('');
  const currentOutputTransRef = useRef<string>('');

  const connect = useCallback(async (apiKey: string) => {
    try {
      if (!apiKey) throw new Error("API Key is required");
      
      // Check for browser support and HTTPS
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone access is not supported. Please ensure you are using HTTPS or localhost.");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputAudioContextRef.current = inputCtx;
      
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputAudioContextRef.current = outputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyzer = inputCtx.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      const dataArray = new Uint8Array(analyzer.frequencyBinCount);
      
      const updateVolume = () => {
        if (!isConnected && !streamRef.current) return;
        analyzer.getByteFrequencyData(dataArray);
        let sum = 0;
        for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        setMicVolume(avg);
        requestAnimationFrame(updateVolume);
      };
      updateVolume();

      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmBlob = createPcmBlob(inputData);
        
        if (sessionPromiseRef.current) {
          sessionPromiseRef.current.then(session => {
            session.sendRealtimeInput({ media: pcmBlob });
          }).catch(err => console.error("Send input error:", err));
        }
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);

      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: { model: 'gemini-2.5-flash-native-audio-preview-12-2025' },
          outputAudioTranscription: { model: 'gemini-2.5-flash-native-audio-preview-12-2025' },
          systemInstruction: `You are Smart Translate. 
          1. Listen to the user.
          2. Translate speech to Traditional Chinese (繁體中文) immediately.
          3. Keep output concise and accurate.
          4. Do not engage in conversation, just translate.`,
        }
      };

      const sessionPromise = ai.live.connect({
        ...config,
        callbacks: {
          onopen: () => {
            setIsConnected(true);
            setError(null);
          },
          onmessage: async (msg: LiveServerMessage) => {
            const serverContent = msg.serverContent;

            if (serverContent?.inputTranscription) {
              const text = serverContent.inputTranscription.text;
              if (text) {
                  currentInputTransRef.current += text;
                  onTranscriptUpdate({
                      id: 'input-curr',
                      speaker: 'user',
                      text: currentInputTransRef.current,
                      timestamp: Date.now(),
                      isPartial: true
                  });
              }
            }
            
            if (serverContent?.outputTranscription) {
              const text = serverContent.outputTranscription.text;
              if (text) {
                  currentOutputTransRef.current += text;
                  onTranscriptUpdate({
                      id: 'output-curr',
                      speaker: 'model',
                      text: currentOutputTransRef.current,
                      timestamp: Date.now(),
                      isPartial: true
                  });
              }
            }

            if (serverContent?.turnComplete) {
              if (currentInputTransRef.current) {
                 onTranscriptUpdate({
                      id: `user-${Date.now()}`,
                      speaker: 'user',
                      text: currentInputTransRef.current,
                      timestamp: Date.now(),
                      isPartial: false
                  });
                  currentInputTransRef.current = '';
              }
              if (currentOutputTransRef.current) {
                 onTranscriptUpdate({
                      id: `model-${Date.now()}`,
                      speaker: 'model',
                      text: currentOutputTransRef.current,
                      timestamp: Date.now(),
                      isPartial: false
                  });
                  currentOutputTransRef.current = '';
              }
            }

            const audioData = serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && !isAudioMuted && outputCtx) {
                try {
                    const bytes = base64ToUint8Array(audioData);
                    const audioBuffer = await decodeAudioData(bytes, outputCtx, 24000, 1);
                    
                    const source = outputCtx.createBufferSource();
                    source.buffer = audioBuffer;
                    source.connect(outputCtx.destination);
                    
                    const currentTime = outputCtx.currentTime;
                    const startTime = Math.max(currentTime, nextStartTimeRef.current);
                    source.start(startTime);
                    nextStartTimeRef.current = startTime + audioBuffer.duration;
                } catch (e) {
                    console.error("Audio decode error", e);
                }
            }
          },
          onclose: () => {
            setIsConnected(false);
          },
          onerror: (err) => {
            setError(err.message || "Connection error");
            setIsConnected(false);
          }
        }
      });

      sessionPromiseRef.current = sessionPromise;

    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setIsConnected(false);
    }
  }, [onTranscriptUpdate, isAudioMuted]);

  const disconnect = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
    }
    if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current = null;
    }
    if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close();
        inputAudioContextRef.current = null;
    }
    if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close();
        outputAudioContextRef.current = null;
    }
    setIsConnected(false);
    nextStartTimeRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return { connect, disconnect, isConnected, error, micVolume };
};