import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, ArrowUpRight, ArrowDownLeft, ChevronDown, ChevronRight } from 'lucide-react';
import type { McpMessageLog } from '../services/mcp';

interface McpInspectorProps {
  logs: McpMessageLog[];
  onClearLogs: () => void;
}

export const McpInspector: React.FC<McpInspectorProps> = ({ logs, onClearLogs }) => {
  const [expandedLogs, setExpandedLogs] = useState<Record<number, boolean>>({});
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const toggleExpand = (index: number) => {
    setExpandedLogs(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950/60 border border-zinc-800 rounded-lg backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-950/80 border-b border-zinc-800">
        <h3 className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5 font-mono">
          <Terminal className="w-3.5 h-3.5 text-sky-400" />
          MCP JSON-RPC Log
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-[10px] text-zinc-500 flex items-center gap-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-850 text-sky-500 focus:ring-sky-500 w-3 h-3"
            />
            Auto-Scroll
          </label>
          <button
            type="button"
            onClick={onClearLogs}
            disabled={logs.length === 0}
            className="text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-all"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Logs container */}
      <div 
        ref={logContainerRef}
        className="flex-1 overflow-y-auto p-2 font-mono text-[10px] space-y-1 bg-black/30"
      >
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-zinc-600 italic text-center p-4">
            No JSON-RPC traffic logged yet.
          </div>
        ) : (
          logs.map((log, index) => {
            const isExpanded = expandedLogs[index] || false;
            const isSent = log.direction === 'sent';
            
            // Try to identify method or response status
            let label = '';
            if (log.payload) {
              if (log.payload.method) {
                label = `${log.payload.method} (req)`;
              } else if (log.payload.result) {
                label = `Response (ok)`;
              } else if (log.payload.error) {
                label = `Response (err: ${log.payload.error.code || 'unknown'})`;
              } else {
                label = 'JSON-RPC Packet';
              }
            }

            return (
              <div 
                key={index} 
                className={`border rounded border-zinc-900/60 overflow-hidden ${
                  isSent ? 'bg-sky-950/10' : 'bg-emerald-950/10'
                }`}
              >
                {/* Log Summary Header */}
                <div 
                  onClick={() => toggleExpand(index)}
                  className="flex items-center justify-between p-1.5 cursor-pointer hover:bg-zinc-900/40 select-none text-[9px] gap-2"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-zinc-500" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-zinc-500" />
                    )}
                    
                    {isSent ? (
                      <span className="text-sky-400 flex items-center gap-0.5 font-bold">
                        <ArrowUpRight className="w-3 h-3" /> OUT
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-0.5 font-bold">
                        <ArrowDownLeft className="w-3 h-3" /> IN
                      </span>
                    )}

                    <span className="text-zinc-500 font-normal">{log.timestamp}</span>
                    <span className="text-zinc-300 font-semibold truncate">{label}</span>
                  </div>
                  
                  {log.payload?.id !== undefined && (
                    <span className="text-zinc-600 text-[8px] bg-zinc-900 px-1 rounded">
                      id: {log.payload.id}
                    </span>
                  )}
                </div>

                {/* Log Payload Details */}
                {isExpanded && (
                  <div className="p-2 border-t border-zinc-900/40 bg-zinc-950/60 overflow-x-auto">
                    <pre className="text-zinc-400 text-[9px] leading-relaxed whitespace-pre-wrap word-break-all">
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
