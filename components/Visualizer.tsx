import React from 'react';

interface VisualizerProps {
  volume: number; // 0 to 255
}

const Visualizer: React.FC<VisualizerProps> = ({ volume }) => {
  // Normalize volume for easier scaling (0 to 1)
  const normalized = Math.min(Math.max(volume / 50, 0.1), 1.5);

  return (
    <div className="flex items-center justify-center h-24 w-full relative overflow-hidden">
      {/* Background pulsing ring */}
      <div 
        className="absolute rounded-full bg-blue-500/20 transition-all duration-100 ease-out"
        style={{
            width: `${8 * normalized}rem`,
            height: `${8 * normalized}rem`,
        }}
      />
      {/* Core pulsing ring */}
      <div 
        className="absolute rounded-full bg-blue-500/40 transition-all duration-75 ease-out"
        style={{
            width: `${5.5 * normalized}rem`,
            height: `${5.5 * normalized}rem`,
        }}
      />
       {/* Inner circle */}
       <div className="z-10 bg-blue-600 rounded-full w-16 h-16 flex items-center justify-center shadow-lg animate-pulse">
           <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
               <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
               <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
               <line x1="12" x2="12" y1="19" y2="22" />
           </svg>
       </div>
    </div>
  );
};

export default Visualizer;