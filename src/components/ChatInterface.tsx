import React, { useState, useRef, useEffect } from 'react';
import { Send, Cpu, ChevronDown, ChevronRight, Loader2, Info } from 'lucide-react';
import type { ChatMessage } from '../services/ai';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  isLoading: boolean;
  onSendMessage: (content: string) => void;
}

// Simple parser to format markdown-like text (bold, inline code, and code blocks) safely
const MessageContent: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return null;

  // Split content by code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
      {parts.map((part, index) => {
        // If it is a code block
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n([\s\S]*?)```/);
          const lang = match ? match[1] : '';
          const code = match ? match[2] : part.slice(3, -3);

          return (
            <div key={index} className="my-2 border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950/80 font-mono text-xs">
              {lang && (
                <div className="px-3 py-1 bg-zinc-900 text-zinc-500 border-b border-zinc-800 text-[10px] uppercase font-bold flex justify-between items-center">
                  <span>{lang}</span>
                </div>
              )}
              <pre className="p-3 overflow-x-auto text-zinc-400 whitespace-pre">
                <code>{code.trim()}</code>
              </pre>
            </div>
          );
        }

        // Inline text formatting (bold and inline code)
        // Parse line by line to handle paragraphs
        const lines = part.split('\n');
        return lines.map((line, lineIdx) => {
          if (!line.trim() && lines.length > 1) {
            return <div key={`${index}-${lineIdx}`} className="h-2" />;
          }

          // Parse bold **text** and inline code `code`
          const inlineParts = line.split(/(\*\*.*?\*\*|`.*?`)/g);

          return (
            <p key={`${index}-${lineIdx}`} className="text-zinc-300">
              {inlineParts.map((subPart, subIdx) => {
                if (subPart.startsWith('**') && subPart.endsWith('**')) {
                  return <strong key={subIdx} className="font-bold text-zinc-100">{subPart.slice(2, -2)}</strong>;
                }
                if (subPart.startsWith('`') && subPart.endsWith('`')) {
                  return <code key={subIdx} className="px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded font-mono text-xs text-sky-300">{subPart.slice(1, -1)}</code>;
                }
                return subPart;
              })}
            </p>
          );
        });
      })}
    </div>
  );
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  systemPrompt,
  onSystemPromptChange,
  isLoading,
  onSendMessage
}) => {
  const [input, setInput] = useState('');
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSendMessage(input.trim());
    setInput('');
  };

  const toggleToolExpand = (id: string) => {
    setExpandedTools(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950/20 border border-zinc-800 rounded-lg overflow-hidden backdrop-blur-md">
      {/* System Prompt Bar */}
      <div className="border-b border-zinc-800">
        <button
          type="button"
          onClick={() => setShowSystemPrompt(!showSystemPrompt)}
          className="w-full flex items-center justify-between px-4 py-2 hover:bg-zinc-900/30 transition-all text-xs font-semibold text-zinc-400 hover:text-zinc-200"
        >
          <span className="flex items-center gap-1.5 font-mono">
            <Info className="w-3.5 h-3.5 text-zinc-500" />
            System Prompt Instructions
          </span>
          {showSystemPrompt ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {showSystemPrompt && (
          <div className="p-3 bg-zinc-950/40 border-t border-zinc-850">
            <textarea
              value={systemPrompt}
              onChange={(e) => onSystemPromptChange(e.target.value)}
              placeholder="e.g. You are an expert AI assistant that uses the available tools..."
              rows={3}
              className="w-full p-2 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-300 focus:outline-none focus:border-sky-500 transition-all font-mono resize-none"
            />
          </div>
        )}
      </div>

      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.filter(m => m.role !== 'system').length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 space-y-3">
            <Cpu className="w-8 h-8 text-sky-500/80 animate-pulse" />
            <div>
              <h4 className="text-zinc-200 font-semibold text-sm">Welcome to BambuChat</h4>
              <p className="text-zinc-500 text-xs max-w-sm mt-1">
                Configure your API key and connect your local or remote MCP server to begin testing.
              </p>
            </div>
          </div>
        ) : (
          messages
            .filter(m => m.role !== 'system')
            .map((msg) => {
              if (msg.role === 'tool') {
                const isExpanded = expandedTools[msg.id] || false;
                
                return (
                  <div key={msg.id} className="flex flex-col items-start pl-6 border-l-2 border-dashed border-emerald-900/60 py-1 font-mono text-xs">
                    <div 
                      onClick={() => toggleToolExpand(msg.id)}
                      className="flex items-center gap-2 cursor-pointer text-emerald-400 hover:text-emerald-300 text-[11px] font-semibold select-none"
                    >
                      {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      <span>🛠️ Tool Result: {msg.toolName}</span>
                    </div>

                    {isExpanded && (
                      <div className="mt-1.5 w-full bg-zinc-950/60 border border-zinc-900 rounded p-2 overflow-x-auto text-[10px] text-zinc-400 max-h-48 overflow-y-auto font-mono">
                        <pre>{msg.content}</pre>
                      </div>
                    )}
                  </div>
                );
              }

              const isAssistant = msg.role === 'assistant';
              const hasToolCalls = msg.toolCalls && msg.toolCalls.length > 0;

              return (
                <div key={msg.id} className="space-y-2 animate-fade-in">
                  {/* Sender label */}
                  <div className="text-[10px] font-bold tracking-wide text-zinc-500 uppercase flex items-center gap-1.5">
                    <span className={isAssistant ? 'text-sky-400' : 'text-zinc-400'}>
                      {isAssistant ? 'Assistant' : 'User'}
                    </span>
                  </div>

                  {/* Bubble content */}
                  <div className={`p-3.5 rounded-lg border leading-relaxed ${
                    isAssistant 
                      ? 'bg-zinc-950/40 border-zinc-900' 
                      : 'bg-zinc-900/30 border-zinc-800/60'
                  }`}>
                    {msg.content && <MessageContent content={msg.content} />}

                    {/* Rendering tool calls generated by the AI */}
                    {hasToolCalls && (
                      <div className="mt-3 space-y-1.5 border-t border-zinc-900 pt-2.5">
                        {msg.toolCalls?.map((tc) => (
                          <div key={tc.id} className="flex flex-col gap-1 text-[11px] font-mono bg-zinc-950/80 border border-zinc-850 p-2 rounded">
                            <div className="flex items-center gap-1.5 text-sky-400 font-semibold">
                              <Loader2 className="w-3 h-3 animate-spin text-sky-400" />
                              <span>Invoking Tool: {tc.name}</span>
                            </div>
                            <pre className="text-[10px] text-zinc-500 pl-4 mt-0.5 overflow-x-auto">
                              {JSON.stringify(tc.arguments, null, 2)}
                            </pre>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
        )}

        {/* Global Loading Indicator */}
        {isLoading && (
          <div className="flex flex-col gap-1.5 animate-fade-in pl-1">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Assistant</span>
            <div className="p-3 bg-zinc-950/40 border border-zinc-900 rounded-lg flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
              <span>Generating response...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="p-3 bg-zinc-950/60 border-t border-zinc-800 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="Ask a question or request a tool invocation..."
          className="flex-1 px-3.5 py-2 text-xs bg-zinc-900 border border-zinc-800 rounded-md text-zinc-200 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-all placeholder:text-zinc-600 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all disabled:text-zinc-500 disabled:cursor-not-allowed"
        >
          <Send className="w-3.5 h-3.5" />
          Send
        </button>
      </form>
    </div>
  );
};
