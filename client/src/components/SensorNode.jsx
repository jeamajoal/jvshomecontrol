import React from 'react';
import { motion as Motion } from 'framer-motion';
import { AlertCircle, Lock, LockOpen, Flame, Wind, Battery, Zap } from 'lucide-react';

import { getUiScheme } from '../uiScheme';

const SensorNode = ({ label, state, type, metadata, uiScheme }) => {
    const resolvedUiScheme = uiScheme || getUiScheme();

    const getStatusColor = () => {
        switch (type) {
            case 'smoke':
            case 'co':
                return state === 'alarm'
                    ? 'bg-red-500/20 text-red-500 border-red-500/50 animate-glow-red'
                    : 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20';
            case 'motion':
                return state === 'open' // Active
                    ? `${resolvedUiScheme.selectedCard} ${resolvedUiScheme.selectedText} ${resolvedUiScheme.headerGlow}`
                    : 'bg-white/5 text-gray-600 border-white/5 hover:bg-white/10';
            default: // Entry/Window
                if (state === 'open') return 'bg-orange-500/20 text-orange-400 border-orange-500/50 animate-glow-orange scale-105 z-10';
                if (state === 'alarm') return 'bg-red-500/20 text-red-500 border-red-500/50 animate-glow-red scale-110 z-20';
                return 'bg-white/5 text-gray-600 border-white/5 hover:bg-white/10 hover:text-gray-500';
        }
    };

    const getIcon = () => {
        const sizeProps = { className: "w-[35%] h-[35%] transition-all" };

        switch (type) {
            case 'smoke': return <Flame {...sizeProps} />;
            case 'co': return <Wind {...sizeProps} />;
            case 'motion': return <Zap {...sizeProps} className={state === 'open' ? 'fill-current' : ''} />;
            default:
                return state === 'open' ? <LockOpen {...sizeProps} /> : <Lock {...sizeProps} />;
        }
    };

    return (
        <Motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`
        relative flex flex-col items-center justify-center 
        rounded-2xl border transition-all duration-300 
        aspect-square
        w-[12vmin] h-[12vmin] max-w-[130px] max-h-[130px] min-w-[90px] min-h-[90px]
        ${getStatusColor()}
      `}
        >
            <div className="flex-1 flex items-center justify-center w-full pt-2">{getIcon()}</div>

            <span className="text-[1.1vmin] font-bold tracking-wider uppercase text-center leading-tight w-full px-1 pb-3 truncate">
                {label}
            </span>

            {/* Battery Indicator Pill */}
            {metadata?.battery && (
                <div className={`
            absolute top-2 right-2
            flex items-center gap-1 
            bg-black/60 backdrop-blur-md px-1.5 py-0.5 rounded-full border border-white/10
            ${parseInt(metadata.battery) < 20 ? 'text-red-400 border-red-500/30' : 'text-gray-400'}
          `}>
                    <span className="text-[10px] font-medium leading-none">{metadata.battery}%</span>
                    <Battery size={10} />
                </div>
            )}
        </Motion.div>
    );
};

export default SensorNode;
