import React, { useState } from 'react';
import { Cpu, RefreshCw, Radio, ShieldAlert, Plus, Trash2 } from 'lucide-react';
import type { McpTool } from '../services/mcp';

export interface McpPreset {
  id: string;
  name: string;
  command: string;
}

interface McpConfigProps {
  connectionType: 'bridge' | 'sse';
  bridgeUrl: string;
  sseUrl: string;
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  errorMsg?: string;
  tools: McpTool[];
  disabledTools: string[];
  serverInfo: { name: string; version: string } | null;
  
  // Presets State
  presets: McpPreset[];
  selectedPresetId: string;
  customCommand: string;
  
  onConnectionTypeChange: (type: 'bridge' | 'sse') => void;
  onBridgeUrlChange: (url: string) => void;
  onSseUrlChange: (url: string) => void;
  
  // Presets Handlers
  onSelectPreset: (id: string) => void;
  onCustomCommandChange: (cmd: string) => void;
  onAddPreset: (name: string, command: string) => void;
  onDeletePreset: (id: string) => void;
  
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleTool: (toolName: string) => void;
  onRefreshTools: () => void;
}

export const McpConfig: React.FC<McpConfigProps> = ({
  connectionType,
  bridgeUrl,
  sseUrl,
  status,
  errorMsg,
  tools,
  disabledTools,
  serverInfo,
  
  presets,
  selectedPresetId,
  customCommand,
  
  onConnectionTypeChange,
  onBridgeUrlChange,
  onSseUrlChange,
  
  onSelectPreset,
  onCustomCommandChange,
  onAddPreset,
  onDeletePreset,
  
  onConnect,
  onDisconnect,
  onToggleTool,
  onRefreshTools
}) => {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  
  // Preset editing state
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCommand, setNewCommand] = useState('');

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]';
      case 'connecting': return 'bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.6)]';
      case 'error': return 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]';
      default: return 'bg-zinc-600';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      case 'error': return 'Error';
      default: return 'Disconnected';
    }
  };

  const handleAddNewPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newCommand.trim()) return;
    onAddPreset(newName.trim(), newCommand.trim());
    setNewName('');
    setNewCommand('');
    setIsAdding(false);
  };

  const currentPreset = presets.find(p => p.id === selectedPresetId);
  const showCommandInput = selectedPresetId === 'custom';

  return (
    <div className="space-y-4 p-4 bg-zinc-950/40 border border-zinc-800 rounded-lg backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
        <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
          <Cpu className="w-4 h-4 text-emerald-400" />
          Model Context Protocol (MCP)
        </h3>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
          <span className="text-xs font-medium text-zinc-300">{getStatusText()}</span>
        </div>
      </div>

      {/* Connection Type Selector */}
      <div className="flex gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded">
        <button
          type="button"
          onClick={() => onConnectionTypeChange('bridge')}
          className={`flex-1 py-1 text-center text-xs rounded transition-all font-medium ${
            connectionType === 'bridge'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          Local Bridge (Stdio / WS)
        </button>
        <button
          type="button"
          onClick={() => onConnectionTypeChange('sse')}
          className={`flex-1 py-1 text-center text-xs rounded transition-all font-medium ${
            connectionType === 'sse'
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'
          }`}
        >
          SSE Server (HTTP)
        </button>
      </div>

      {/* Connection Mode Fields */}
      {connectionType === 'bridge' ? (
        <div className="space-y-3">
          {/* WebSocket Bridge Port / Address */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Bridge WebSocket URL</label>
            <input
              type="text"
              value={bridgeUrl}
              onChange={(e) => onBridgeUrlChange(e.target.value)}
              disabled={status === 'connected' || status === 'connecting'}
              placeholder="ws://localhost:3001"
              className="w-full px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-50 transition-all font-mono"
            />
          </div>

          {/* MCP Server Presets Manager */}
          <div className="space-y-2 border-t border-zinc-900 pt-3">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-zinc-400">Local MCP Server Preset</label>
              {!isAdding && status === 'disconnected' && (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-0.5 font-semibold"
                >
                  <Plus className="w-3 h-3" /> Add Preset
                </button>
              )}
            </div>

            {isAdding ? (
              <form onSubmit={handleAddNewPreset} className="space-y-2 p-2.5 bg-zinc-900/80 border border-zinc-800 rounded">
                <input
                  type="text"
                  placeholder="Preset Name (e.g. SQLite)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2 py-1 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500"
                  required
                />
                <textarea
                  placeholder="Command (e.g. node dist/main.js)"
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1 text-xs bg-zinc-950 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 font-mono resize-none"
                  required
                />
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAdding(false)}
                    className="px-2 py-1 text-[10px] text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-2 py-1 text-[10px] bg-sky-600 text-white rounded hover:bg-sky-500 font-semibold"
                  >
                    Save
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex gap-1.5">
                <select
                  value={selectedPresetId}
                  onChange={(e) => onSelectPreset(e.target.value)}
                  disabled={status === 'connected' || status === 'connecting'}
                  className="flex-1 px-2.5 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                >
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                  <option value="custom">Custom CLI Command...</option>
                </select>

                {/* Delete preset option */}
                {!showCommandInput && selectedPresetId !== 'bambumind' && status === 'disconnected' && (
                  <button
                    type="button"
                    onClick={() => onDeletePreset(selectedPresetId)}
                    className="px-2 bg-zinc-900 border border-zinc-800 hover:border-rose-900 hover:bg-rose-950/20 text-zinc-500 hover:text-rose-400 rounded transition-all"
                    title="Delete Preset"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Selected command preview or manual entry */}
            {!isAdding && (
              <div>
                {showCommandInput ? (
                  <textarea
                    value={customCommand}
                    onChange={(e) => onCustomCommandChange(e.target.value)}
                    disabled={status === 'connected' || status === 'connecting'}
                    placeholder="e.g. node /path/to/server.js"
                    rows={2}
                    className="w-full px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 font-mono resize-none disabled:opacity-50"
                  />
                ) : (
                  currentPreset && (
                    <div className="p-2 bg-zinc-900/60 border border-zinc-850 rounded font-mono text-[10px] text-zinc-400 break-all leading-normal">
                      <span className="text-zinc-600 block text-[9px] uppercase font-bold tracking-wider mb-0.5">CLI Command:</span>
                      {currentPreset.command}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        // SSE Mode inputs
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1">SSE Stream Endpoint URL</label>
          <input
            type="text"
            value={sseUrl}
            onChange={(e) => onSseUrlChange(e.target.value)}
            disabled={status === 'connected' || status === 'connecting'}
            placeholder="http://localhost:3000/sse"
            className="w-full px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-200 focus:outline-none focus:border-sky-500 disabled:opacity-50 transition-all font-mono"
          />
        </div>
      )}

      {/* Connect/Disconnect actions */}
      <div className="flex gap-2">
        {status === 'connected' ? (
          <button
            type="button"
            onClick={onDisconnect}
            className="flex-1 px-3 py-1.5 text-xs font-medium bg-rose-950/40 text-rose-300 border border-rose-800/60 rounded hover:bg-rose-900/40 transition-all"
          >
            Disconnect Server
          </button>
        ) : (
          <button
            type="button"
            onClick={onConnect}
            disabled={status === 'connecting' || isAdding}
            className="flex-1 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded transition-all disabled:opacity-50"
          >
            Connect Server
          </button>
        )}
      </div>

      {/* Server Info or Error message */}
      {status === 'error' && errorMsg && (
        <div className="p-2 bg-rose-950/20 border border-rose-900/50 rounded flex gap-2 items-start text-xs text-rose-300">
          <ShieldAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {status === 'connected' && serverInfo && (
        <div className="p-2 bg-zinc-900 border border-zinc-800 rounded text-[11px] text-zinc-400 leading-normal">
          <span className="font-semibold text-zinc-300">Active Handshake:</span> {serverInfo.name} ({serverInfo.version})
        </div>
      )}

      {/* Discovered Tools */}
      {status === 'connected' && (
        <div className="space-y-2 pt-2 border-t border-zinc-850">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
              Active Tools ({tools.length})
            </label>
            <button
              type="button"
              onClick={onRefreshTools}
              className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 font-medium bg-zinc-900 hover:bg-zinc-850 px-1.5 py-0.5 rounded border border-zinc-800"
            >
              <RefreshCw className="w-2.5 h-2.5" /> Refresh
            </button>
          </div>

          {tools.length === 0 ? (
            <p className="text-[11px] text-zinc-500 italic p-2 text-center bg-zinc-900/40 rounded border border-dashed border-zinc-800">
              No tools exposed by this MCP server.
            </p>
          ) : (
            <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
              {tools.map((tool) => {
                const isDisabled = disabledTools.includes(tool.name);
                const isExpanded = expandedTool === tool.name;

                return (
                  <div
                    key={tool.name}
                    className={`p-2 border rounded transition-all ${
                      isDisabled
                        ? 'bg-zinc-950/20 border-zinc-900 opacity-60'
                        : 'bg-zinc-900/60 border-zinc-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <input
                          type="checkbox"
                          checked={!isDisabled}
                          onChange={() => onToggleTool(tool.name)}
                          className="rounded border-zinc-700 bg-zinc-800 text-sky-500 focus:ring-sky-500 w-3 h-3 flex-shrink-0"
                        />
                        <span className="font-mono text-xs font-medium text-zinc-200 truncate" title={tool.name}>
                          {tool.name}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedTool(isExpanded ? null : tool.name)}
                        className="text-[10px] text-zinc-500 hover:text-zinc-300 font-medium"
                      >
                        {isExpanded ? 'Hide Schema' : 'Show Schema'}
                      </button>
                    </div>

                    {tool.description && (
                      <p className="text-[10px] text-zinc-400 mt-1 pl-5 line-clamp-2">
                        {tool.description}
                      </p>
                    )}

                    {isExpanded && (
                      <div className="mt-2 pl-5">
                        <pre className="text-[9px] font-mono text-zinc-500 bg-zinc-950 p-1.5 rounded overflow-x-auto border border-zinc-850">
                          {JSON.stringify(tool.inputSchema, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
