
import React from 'react';

const SessionModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                onClick={onClose}
            ></div>
            <div className="relative glass-card p-6 w-full max-w-sm border-emerald-500/30 text-center space-y-4">
                <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center mb-2">
                    <span className="text-2xl">🌱</span>
                </div>

                <h3 className="text-lg font-bold text-white">Start New Session?</h3>
                <p className="text-sm text-slate-400">
                    This will clear your current chat history and context. The map and weather data will remain.
                </p>

                <div className="flex gap-3 pt-2">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-colors text-sm font-bold shadow-lg shadow-emerald-500/20"
                    >
                        Start Fresh
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SessionModal;
