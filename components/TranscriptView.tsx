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
            "flex gap-3 md:gap-4",
            item.speaker === 'user' ? "justify-end" : "justify-start"
          )}
        >
          {item.speaker === 'model' && (
             <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 shadow-sm border border-indigo-50 mt-1">
               <Bot size={16} className="text-indigo-600 md:w-5 md:h-5" />
             </div>
          )}
          
          <div className={clsx(
            "max-w-[85%] md:max-w-2xl rounded-2xl px-5 py-3.5 text-sm md:text-base leading-relaxed shadow-sm",
            item.speaker === 'user' 
                ? "bg-slate-800 text-white rounded-tr-sm" 
                : "bg-white border border-slate-100 text-slate-800 rounded-tl-sm font-medium",
            item.isPartial && "opacity-70 animate-pulse"
          )}>
            {item.speaker === 'model' && <span className="block text-xs text-indigo-500 font-bold mb-1 uppercase tracking-wider">Translation</span>}
            {item.text}
          </div>

          {item.speaker === 'user' && (
             <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-1">
               <User size={16} className="text-slate-500 md:w-5 md:h-5" />
             </div>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default TranscriptView;