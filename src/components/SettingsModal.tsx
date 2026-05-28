import React, { useState, useEffect } from 'react';
import { Key, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSaveSettings: () => void;
}

export function SettingsModal({ isOpen, onClose, onSaveSettings }: Props) {
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('kie_client_api_key');
      if (stored) setApiKey(stored);
    }
  }, [isOpen]);

  const handleSave = () => {
    const nextKey = apiKey.trim();
    localStorage.setItem('kie_client_api_key', nextKey);
    onSaveSettings();
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-6"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-neutral-500 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Key className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Settings</h2>
                <p className="text-xs text-neutral-400">Configure your connection to Kie AI</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Kie AI API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-neutral-950 border border-neutral-700/50 rounded-xl px-4 py-3 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500 focus:ring-1 ring-indigo-500 transition-all"
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Stored securely in your browser's local storage. Will automatically override the server environment variable if set.
                </p>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-500 hover:bg-indigo-400 text-white transition-colors shadow-lg"
              >
                Save Settings
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
