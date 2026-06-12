import React, { useState } from 'react';
import { Key, Eye, EyeOff, X, Check, Info } from 'lucide-react';

export interface ApiKeysConfig {
  geminiKey: string;
  geminiModel: string;
  openaiKey: string;
  openaiModel: string;
  claudeKey: string;
  claudeModel: string;
}

interface KeyConfigProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiKeysConfig;
  onChange: (config: ApiKeysConfig) => void;
  activeProvider: 'gemini' | 'openai' | 'claude';
  onActiveProviderChange: (provider: 'gemini' | 'openai' | 'claude') => void;
}

export const KeyConfig: React.FC<KeyConfigProps> = ({
  isOpen,
  onClose,
  config,
  onChange,
  activeProvider,
  onActiveProviderChange
}) => {
  const [showKey, setShowKey] = useState(false);
  const [tempConfig, setTempConfig] = useState<ApiKeysConfig>({ ...config });
  const [saved, setSaved] = useState(false);

  // Sync temp config when modal opens or config changes externally
  React.useEffect(() => {
    if (isOpen) {
      setTempConfig({ ...config });
      setSaved(false);
      setShowKey(false);
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onChange(tempConfig);
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  const updateField = (field: keyof ApiKeysConfig, value: string) => {
    setTempConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const getPlaceholder = () => {
    switch (activeProvider) {
      case 'gemini': return 'AIzaSy... (Gemini API Key)';
      case 'openai': return 'sk-proj-... (OpenAI API Key)';
      case 'claude': return 'sk-ant-api03-... (Claude API Key)';
    }
  };

  const getHelpText = () => {
    switch (activeProvider) {
      case 'gemini':
        return 'Get a free key from Google AI Studio. Direct browser calls are supported via CORS.';
      case 'openai':
        return 'Standard OpenAI API key. Direct browser calls are supported via CORS.';
      case 'claude':
        return 'Anthropic Claude key. Note: Claude browser requests require the local bridge running to bypass CORS constraints.';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      {/* Modal Box */}
      <div className="relative w-full max-w-md transform overflow-hidden rounded-lg bg-zinc-950 border border-zinc-800 p-6 shadow-2xl transition-all z-10 animate-fade-in">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
            <Key className="w-5 h-5 text-sky-400" />
            API & Key Configurations
          </h3>
          <button 
            type="button" 
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-200 rounded p-1 hover:bg-zinc-900 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex gap-1.5 p-1 bg-zinc-900 border border-zinc-800/80 rounded-md mb-5">
          {(['gemini', 'openai', 'claude'] as const).map((prov) => (
            <button
              key={prov}
              type="button"
              onClick={() => {
                onActiveProviderChange(prov);
                setShowKey(false);
              }}
              className={`flex-1 py-1.5 text-center text-xs font-bold uppercase tracking-wider rounded transition-all ${
                activeProvider === prov
                  ? 'bg-zinc-800 text-sky-400 border border-zinc-700/60'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {prov}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="space-y-4">
          {/* API Key Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              {activeProvider.toUpperCase()} API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={
                  activeProvider === 'gemini' ? tempConfig.geminiKey :
                  activeProvider === 'openai' ? tempConfig.openaiKey :
                  tempConfig.claudeKey
                }
                onChange={(e) => updateField(
                  activeProvider === 'gemini' ? 'geminiKey' :
                  activeProvider === 'openai' ? 'openaiKey' :
                  'claudeKey', 
                  e.target.value
                )}
                placeholder={getPlaceholder()}
                className="w-full px-3 py-2.5 pr-10 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-100 font-mono focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-zinc-650"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Model Name Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              Model Name
            </label>
            <input
              type="text"
              value={
                activeProvider === 'gemini' ? tempConfig.geminiModel :
                activeProvider === 'openai' ? tempConfig.openaiModel :
                tempConfig.claudeModel
              }
              onChange={(e) => updateField(
                activeProvider === 'gemini' ? 'geminiModel' :
                activeProvider === 'openai' ? 'openaiModel' :
                'claudeModel', 
                e.target.value
              )}
              placeholder="e.g. default-model-string"
              className="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 font-mono focus:outline-none focus:border-sky-500 transition-all text-xs"
            />
          </div>

          {/* Helper details */}
          <div className="flex gap-2 p-2.5 bg-zinc-900/40 border border-zinc-900 rounded-md text-[10.5px] text-zinc-400 leading-relaxed">
            <Info className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
            <span>{getHelpText()}</span>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 justify-end pt-3 border-t border-zinc-900">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all"
            >
              {saved ? (
                <>
                  <Check className="w-3.5 h-3.5" /> Saved
                </>
              ) : (
                'Save Config'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
