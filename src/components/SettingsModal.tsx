import React, { useState, useEffect } from 'react';
import { History, Key, Moon, Sun, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import type { AppTheme } from '../types';

const APP_VERSION = '1.4.0';
const UPDATE_LOG = [
  {
    version: '1.4.0',
    date: '2026-09-02',
    changes: [
      'Updated Kie models and credit estimates.',
      'Added parallel generation and selectable activity items.',
      'Credits now refresh automatically while jobs run and when they finish.',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-08-03',
    changes: [
      'Added Light and Dark theme settings.',
      'Added PixVerse V6 and MiniMax H3 modes with live cost estimates.',
      'Kept model Parameters open by default.',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-19',
    changes: [
      'Added resizable model and activity panes.',
      'Added the video editor workflow and Clypra adapter host.',
    ],
  },
];

interface Props {
  isOpen: boolean;
  autoplayVideos: boolean;
  theme: AppTheme;
  onClose: () => void;
  onSaveSettings: (autoplayVideos: boolean, theme: AppTheme) => void;
}

export function SettingsModal({ isOpen, autoplayVideos, theme, onClose, onSaveSettings }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [autoplay, setAutoplay] = useState(autoplayVideos);
  const [selectedTheme, setSelectedTheme] = useState<AppTheme>(theme);

  useEffect(() => {
    if (isOpen) {
      const stored = localStorage.getItem('kie_client_api_key');
      if (stored) setApiKey(stored);
      setAutoplay(autoplayVideos);
      setSelectedTheme(theme);
    }
  }, [isOpen, autoplayVideos, theme]);

  const handleSave = () => {
    const nextKey = apiKey.trim();
    localStorage.setItem('kie_client_api_key', nextKey);
    localStorage.setItem('kie_autoplay_videos', String(autoplay));
    localStorage.setItem('kie_theme', selectedTheme);
    onSaveSettings(autoplay, selectedTheme);
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
            className="relative flex w-full max-w-lg max-h-[85vh] flex-col overflow-hidden bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl p-6"
          >
            <button
              type="button"
              onClick={onClose}
              className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-100 transition-colors"
              title="Close settings"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-start gap-3 mb-6 pr-8">
              <div className="w-10 h-10 shrink-0 rounded-full bg-indigo-500/20 flex items-center justify-center">
                <Key className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-neutral-100">Settings</h2>
                <p className="text-xs text-neutral-400">Connection, appearance, and app information</p>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-neutral-200">Appearance</h3>
                  <p className="text-xs text-neutral-500 mt-1">Choose the workspace color theme.</p>
                </div>
                <div role="group" aria-label="Theme" className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-800 bg-neutral-950 p-1">
                  <button
                    type="button"
                    aria-pressed={selectedTheme === 'light'}
                    onClick={() => setSelectedTheme('light')}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${selectedTheme === 'light' ? 'bg-indigo-500 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}`}
                  >
                    <Sun className="w-4 h-4" />
                    Light
                  </button>
                  <button
                    type="button"
                    aria-pressed={selectedTheme === 'dark'}
                    onClick={() => setSelectedTheme('dark')}
                    className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${selectedTheme === 'dark' ? 'bg-indigo-500 text-white' : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'}`}
                  >
                    <Moon className="w-4 h-4" />
                    Dark
                  </button>
                </div>
              </section>

              <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
                <div>
                  <span className="block text-sm font-medium text-neutral-300">Autoplay videos</span>
                  <span className="block text-xs text-neutral-500 mt-1">Play new results automatically</span>
                </div>
                <input
                  type="checkbox"
                  checked={autoplay}
                  onChange={(event) => setAutoplay(event.target.checked)}
                  className="h-4 w-4 accent-indigo-500"
                />
              </label>

              <div>
                <label className="block text-sm font-medium text-neutral-300 mb-2">
                  Kie AI API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full bg-neutral-950 border border-neutral-700/50 rounded-xl px-4 py-3 text-sm text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:border-indigo-500 focus:ring-1 ring-indigo-500 transition-all"
                />
                <p className="text-xs text-neutral-500 mt-2">
                  Stored securely in your browser's local storage. Will automatically override the server environment variable if set.
                </p>
              </div>

              <section className="border-t border-neutral-800 pt-5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold text-neutral-200">Update log</h3>
                  </div>
                  <span className="text-xs font-mono text-neutral-500">v{APP_VERSION}</span>
                </div>
                <div className="mt-3 space-y-4">
                  {UPDATE_LOG.map((release) => (
                    <div key={release.version} className="border-l-2 border-indigo-500/40 pl-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-neutral-200">Version {release.version}</span>
                        <span className="text-[11px] text-neutral-500">{release.date}</span>
                      </div>
                      <ul className="mt-2 space-y-1 text-xs leading-relaxed text-neutral-500">
                        {release.changes.map((change) => <li key={change}>{change}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="mt-5 flex shrink-0 justify-end gap-3 border-t border-neutral-800 bg-neutral-900 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-neutral-100 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
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
