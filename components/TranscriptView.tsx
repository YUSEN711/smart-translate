import React, { useEffect, useRef } from 'react';
import { TranscriptItem } from '../types';
import clsx from 'clsx';
import { Bot, User } from 'lucide-react';

interface TranscriptViewProps {
  items: TranscriptItem[];
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ items }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scrollbar-hide pb-32 md:pb-32">
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-center text-slate-400 mt-10 md:mt-0">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <Bot size={32} className="text-slate-300" />
          </div>
          <p className="font-medium text-lg">Listening for lecture audio...</p>
          <p className="text-sm mt-2 max-w-xs mx-auto">Speak or play audio to begin real-time translation and transcription.</p>
        </div>
      )}

      {items.map((item) => (
        <div
          key={item.id}
          className={clsx(
            "flex gap-4 group",
            item.speaker === 'user' ? "flex-row-reverse" : "flex-row"
          )}
        >
          {item.speaker === 'model' && (
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-200 mt-1 ring-2 ring-white">
              <Bot size={20} className="text-white" />
            </div>
          )}

          <div className={clsx(
            "max-w-[85%] md:max-w-2xl px-6 py-4 text-sm md:text-base leading-relaxed shadow-sm transition-all duration-300 hover:shadow-md",
            item.speaker === 'user'
              ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl rounded-tr-sm"
              : "bg-white/80 backdrop-blur-sm border border-indigo-50 text-slate-700 rounded-2xl rounded-tl-sm shadow-indigo-100",
            item.isPartial && "opacity-80 animate-pulse"
          )}>
            {item.speaker === 'model' && (
              <div className="flex items-center gap-2 mb-2 pb-2 border-b border-indigo-50/50">
                <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border border-indigo-100">AI Translation</span>
              </div>
            )}
            {item.text}
          </div>

          {item.speaker === 'user' && (
            <div className="w-10 h-10 rounded-2xl bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-inner">
              <User size={20} className="text-slate-500" />
            </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default TranscriptView;