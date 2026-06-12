import { useState, useEffect, useRef } from 'react';
import { BrainCircuit, Trash2, Settings } from 'lucide-react';
import { KeyConfig } from './components/KeyConfig';
import type { ApiKeysConfig } from './components/KeyConfig';
import { McpConfig } from './components/McpConfig';
import type { McpPreset } from './components/McpConfig';
import { McpInspector } from './components/McpInspector';
import { ChatInterface } from './components/ChatInterface';
import { McpClient } from './services/mcp';
import type { McpTool, McpMessageLog, McpPrompt } from './services/mcp';
import { generateMessage } from './services/ai';
import type { ChatMessage } from './services/ai';

const DEFAULT_KEYS: ApiKeysConfig = {
  geminiKey: '',
  geminiModel: 'gemini-1.5-flash',
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',
  claudeKey: '',
  claudeModel: 'claude-3-5-sonnet-20241022'
};

const DEFAULT_SYSTEM_PROMPT = 
  "You are a helpful AI assistant. You have access to a set of tools from the Model Context Protocol (MCP) server. " +
  "Use these tools to help the user with their requests. " +
  "Always answer in the language the user speaks.";

function App() {
  // Config States
  const [config, setConfig] = useState<ApiKeysConfig>(() => {
    const saved = localStorage.getItem('bambuchat_keys');
    return saved ? { ...DEFAULT_KEYS, ...JSON.parse(saved) } : DEFAULT_KEYS;
  });

  const [provider, setProvider] = useState<'gemini' | 'openai' | 'claude'>(() => {
    return (localStorage.getItem('bambuchat_provider') as any) || 'gemini';
  });

  const [connectionType, setConnectionType] = useState<'bridge' | 'sse'>(() => {
    return (localStorage.getItem('bambuchat_connection_type') as any) || 'bridge';
  });

  const [bridgeUrl, setBridgeUrl] = useState(() => {
    return localStorage.getItem('bambuchat_bridge_url') || 'ws://localhost:3001';
  });

  const [sseUrl, setSseUrl] = useState(() => {
    return localStorage.getItem('bambuchat_sse_url') || 'http://localhost:3000/sse';
  });

  const [systemPrompt, setSystemPrompt] = useState(() => {
    return localStorage.getItem('bambuchat_system_prompt') || DEFAULT_SYSTEM_PROMPT;
  });

  // MCP Presets State
  const [presets, setPresets] = useState<McpPreset[]>(() => {
    const saved = localStorage.getItem('bambuchat_presets');
    const defaultPresets: McpPreset[] = [];
    return saved ? JSON.parse(saved) : defaultPresets;
  });

  const [selectedPresetId, setSelectedPresetId] = useState<string>(() => {
    return localStorage.getItem('bambuchat_selected_preset_id') || 'custom';
  });

  const [customCommand, setCustomCommand] = useState<string>(() => {
    return localStorage.getItem('bambuchat_custom_command') || '';
  });

  useEffect(() => {
    localStorage.setItem('bambuchat_presets', JSON.stringify(presets));
  }, [presets]);

  useEffect(() => {
    localStorage.setItem('bambuchat_selected_preset_id', selectedPresetId);
  }, [selectedPresetId]);

  useEffect(() => {
    localStorage.setItem('bambuchat_custom_command', customCommand);
  }, [customCommand]);

  const handleAddPreset = (name: string, command: string) => {
    const newPreset: McpPreset = {
      id: `preset_${Date.now()}`,
      name,
      command
    };
    setPresets(prev => [...prev, newPreset]);
    setSelectedPresetId(newPreset.id);
  };

  const handleDeletePreset = (id: string) => {
    setPresets(prev => prev.filter(p => p.id !== id));
    setSelectedPresetId('custom');
  };

  // Client / Telemetry States
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [tools, setTools] = useState<McpTool[]>([]);
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<McpPrompt[]>([]);
  const [serverInfo, setServerInfo] = useState<{ name: string; version: string } | null>(null);
  const [logs, setLogs] = useState<McpMessageLog[]>([]);

  // Chat States
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isKeyConfigOpen, setIsKeyConfigOpen] = useState(false);

  // Client references
  const mcpClientRef = useRef<McpClient | null>(null);

  // Sync state to local storage on changes
  useEffect(() => {
    localStorage.setItem('bambuchat_keys', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('bambuchat_provider', provider);
  }, [provider]);

  useEffect(() => {
    localStorage.setItem('bambuchat_connection_type', connectionType);
  }, [connectionType]);

  useEffect(() => {
    localStorage.setItem('bambuchat_bridge_url', bridgeUrl);
  }, [bridgeUrl]);

  useEffect(() => {
    localStorage.setItem('bambuchat_sse_url', sseUrl);
  }, [sseUrl]);

  useEffect(() => {
    localStorage.setItem('bambuchat_system_prompt', systemPrompt);
  }, [systemPrompt]);

  // Clean up connection on unmount
  useEffect(() => {
    return () => {
      mcpClientRef.current?.disconnect();
    };
  }, []);

  // Connect to MCP Server
  const handleConnect = async () => {
    setErrorMsg('');
    
    // Create new client instance
    const client = new McpClient();
    mcpClientRef.current = client;

    // Register log listener
    client.onMessage((log) => {
      setLogs(prev => [...prev, log]);
    });

    // Register status listener
    client.onStatusChange((newStatus, err) => {
      setStatus(newStatus);
      if (err) setErrorMsg(err);
      
      if (newStatus === 'connected') {
        setTools(client.tools);
        setPrompts(client.prompts);
        setServerInfo(client.serverInfo);
      } else if (newStatus === 'disconnected' || newStatus === 'error') {
        setTools([]);
        setPrompts([]);
        setServerInfo(null);
      }
    });

    try {
      if (connectionType === 'bridge') {
        let resolvedCommand = '';
        if (selectedPresetId === 'custom') {
          resolvedCommand = customCommand;
        } else {
          const matched = presets.find(p => p.id === selectedPresetId);
          if (matched) {
            resolvedCommand = matched.command;
          }
        }
        await client.connectWebSocket(bridgeUrl, resolvedCommand);
      } else {
        await client.connectSSE(sseUrl);
      }
    } catch (err) {
      console.error('Failed to establish connection to MCP:', err);
    }
  };

  const handleDisconnect = () => {
    if (mcpClientRef.current) {
      mcpClientRef.current.disconnect();
      mcpClientRef.current = null;
    }
  };

  const handleRefreshTools = async () => {
    if (mcpClientRef.current) {
      try {
        const refreshed = await mcpClientRef.current.refreshTools();
        setTools(refreshed);
        try {
          const refreshedPrompts = await mcpClientRef.current.refreshPrompts();
          setPrompts(refreshedPrompts);
        } catch (promptErr) {
          console.log('Prompts refresh not supported:', promptErr);
        }
      } catch (err) {
        console.error('Failed to refresh tools:', err);
      }
    }
  };

  const handleSelectPrompt = async (promptName: string) => {
    if (!mcpClientRef.current || status !== 'connected') return;
    try {
      setIsLoading(true);
      const res = await mcpClientRef.current.getPrompt(promptName);
      if (res && res.messages && res.messages.length > 0) {
        const firstMsg = res.messages[0];
        const contentText = typeof firstMsg.content === 'string'
          ? firstMsg.content
          : firstMsg.content?.text || '';
        
        if (contentText) {
          setSystemPrompt(contentText);
          setMessages(prev => [
            ...prev,
            {
              id: `system_${Date.now()}`,
              role: 'assistant',
              content: `🔄 Loaded instructions from MCP Prompt **${promptName}** into System Prompt.`
            }
          ]);
        }
      }
    } catch (err) {
      console.error('Failed to load MCP prompt:', err);
      alert(`Failed to load MCP prompt: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTool = (toolName: string) => {
    setDisabledTools(prev =>
      prev.includes(toolName)
        ? prev.filter(t => t !== toolName)
        : [...prev, toolName]
    );
  };

  const clearLogs = () => {
    setLogs([]);
  };

  const clearChat = () => {
    setMessages([]);
    setIsLoading(false);
  };

  // Get active model based on current provider selection
  const getActiveModel = () => {
    if (provider === 'gemini') return config.geminiModel;
    if (provider === 'openai') return config.openaiModel;
    return config.claudeModel;
  };

  // Get API key based on current provider selection
  const getApiKey = () => {
    if (provider === 'gemini') return config.geminiKey;
    if (provider === 'openai') return config.openaiKey;
    return config.claudeKey;
  };

  // Run chat dialogue loop (handles nested tool execution loops)
  const handleSendMessage = async (userContent: string) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      alert(`Please input your API Key for ${provider.toUpperCase()} in the sidebar configuration first.`);
      return;
    }

    const currentModel = getActiveModel();
    const activeTools = tools.filter(t => !disabledTools.includes(t.name));

    // 1. Add user message to history
    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: userContent
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    let currentConversation = [...updatedMessages];

    try {
      // Loop to handle potential multiple sequential tool calls
      while (true) {
        // Generate AI completion
        const result = await generateMessage({
          provider,
          apiKey,
          model: currentModel,
          messages: currentConversation,
          systemPrompt,
          tools: activeTools,
          bridgeUrl: connectionType === 'bridge' ? bridgeUrl : undefined
        });

        // Map response
        const assistantMessage: ChatMessage = {
          id: `assistant_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          role: 'assistant',
          content: result.content,
          toolCalls: result.toolCalls,
          geminiParts: result.geminiParts
        };

        currentConversation.push(assistantMessage);
        setMessages([...currentConversation]);

        // If no tool calls were requested, we are done
        if (!result.toolCalls || result.toolCalls.length === 0) {
          break;
        }

        // Process each tool call sequentially
        for (const toolCall of result.toolCalls) {
          // Verify if tool is disabled
          if (disabledTools.includes(toolCall.name)) {
            const errorText = `Error: Tool '${toolCall.name}' is disabled in the config panel.`;
            currentConversation.push({
              id: `tool_${toolCall.id}`,
              role: 'tool',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: JSON.stringify({ error: errorText })
            });
            continue;
          }

          if (!mcpClientRef.current || status !== 'connected') {
            const errorText = `Error: MCP Server disconnected during invocation.`;
            currentConversation.push({
              id: `tool_${toolCall.id}`,
              role: 'tool',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: JSON.stringify({ error: errorText })
            });
            continue;
          }

          try {
            // Execute the tool locally on the MCP client
            const callResult = await mcpClientRef.current.callTool(toolCall.name, toolCall.arguments);
            
            // Format result block to text
            let formattedContent = '';
            if (callResult.content && Array.isArray(callResult.content)) {
              formattedContent = callResult.content
                .map((part: any) => (part.type === 'text' ? part.text : JSON.stringify(part)))
                .join('\n');
            } else {
              formattedContent = JSON.stringify(callResult);
            }

            // Append tool response
            currentConversation.push({
              id: `tool_${toolCall.id}`,
              role: 'tool',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: formattedContent
            });
          } catch (toolErr) {
            console.error(`Tool invocation error for ${toolCall.name}:`, toolErr);
            currentConversation.push({
              id: `tool_${toolCall.id}`,
              role: 'tool',
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              content: JSON.stringify({ error: (toolErr as Error).message || 'Execution failed' })
            });
          }
        }

        // Update messages view to show execution results
        setMessages([...currentConversation]);
        
        // Loop triggers again with updated history containing tool result
      }
    } catch (err) {
      console.error('Chat execution failed:', err);
      // Append system error message
      setMessages(prev => [
        ...prev,
        {
          id: `system_error_${Date.now()}`,
          role: 'assistant',
          content: `⚠️ **Error generating response:**\n${(err as Error).message || 'API request failed. Please check your credentials or bridge logs.'}`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-zinc-900 via-zinc-950 to-black text-zinc-100 overflow-hidden font-sans select-none">
      {/* Header */}
      <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-6 flex-shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <BrainCircuit className="w-6 h-6 text-sky-500 shadow-[0_0_12px_rgba(14,165,233,0.3)] animate-pulse" />
          <div>
            <h1 className="text-sm font-bold tracking-tight text-zinc-100 flex items-center gap-1.5 leading-none">
              BambuChat
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 bg-zinc-900 border border-zinc-850 rounded text-zinc-500">v1.0.0</span>
            </h1>
            <p className="text-[10px] text-zinc-500 mt-0.5 leading-none">Model Context Protocol (MCP) Client Debugger</p>
          </div>
        </div>

        {/* Global Settings & Provider Selector */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wide">Provider:</span>
            <div className="flex gap-1 p-0.5 bg-zinc-900 border border-zinc-850 rounded">
              {(['gemini', 'openai', 'claude'] as const).map((prov) => (
                <button
                  key={prov}
                  type="button"
                  onClick={() => setProvider(prov)}
                  className={`px-2 py-1 text-[10px] font-bold tracking-wide rounded uppercase transition-all ${
                    provider === prov
                      ? 'bg-zinc-800 text-sky-400'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {prov}
                </button>
              ))}
            </div>
          </div>
          
          <button
            type="button"
            onClick={() => setIsKeyConfigOpen(true)}
            className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide text-zinc-500 hover:text-zinc-300 transition-all border border-zinc-850 hover:bg-zinc-900 px-2.5 py-1.5 rounded uppercase"
          >
            <Settings className="w-3 h-3.5 text-zinc-500" />
            API Keys
          </button>

          <button
            type="button"
            onClick={clearChat}
            disabled={messages.length === 0}
            className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-zinc-500 hover:text-zinc-300 disabled:opacity-40 transition-all border border-zinc-850 hover:bg-zinc-900 px-2 py-1.5 rounded uppercase"
          >
            <Trash2 className="w-3 h-3" /> Clear Chat
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <main className="flex-1 flex overflow-hidden w-full relative">
        {/* Left Config Sidebar */}
        <aside className="w-80 border-r border-zinc-800 p-4 flex flex-col gap-4 overflow-y-auto bg-zinc-950/20 flex-shrink-0">
          <McpConfig
            connectionType={connectionType}
            bridgeUrl={bridgeUrl}
            sseUrl={sseUrl}
            status={status}
            errorMsg={errorMsg}
            tools={tools}
            disabledTools={disabledTools}
            serverInfo={serverInfo}
            presets={presets}
            selectedPresetId={selectedPresetId}
            customCommand={customCommand}
            onConnectionTypeChange={setConnectionType}
            onBridgeUrlChange={setBridgeUrl}
            onSseUrlChange={setSseUrl}
            onSelectPreset={setSelectedPresetId}
            onCustomCommandChange={setCustomCommand}
            onAddPreset={handleAddPreset}
            onDeletePreset={handleDeletePreset}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onToggleTool={handleToggleTool}
            onRefreshTools={handleRefreshTools}
            prompts={prompts}
            onSelectPrompt={handleSelectPrompt}
          />
        </aside>

        {/* Center Chat Work Area */}
        <section className="flex-1 flex flex-col p-4 overflow-hidden">
          <ChatInterface
            messages={messages}
            systemPrompt={systemPrompt}
            onSystemPromptChange={setSystemPrompt}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onResetSystemPrompt={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
          />
        </section>

        {/* Right Telemetry logs */}
        <aside className="w-96 border-l border-zinc-800 p-4 flex flex-col overflow-hidden bg-zinc-950/20 flex-shrink-0">
          <McpInspector logs={logs} onClearLogs={clearLogs} />
        </aside>
      </main>

      {/* Key Config Modal */}
      <KeyConfig
        isOpen={isKeyConfigOpen}
        onClose={() => setIsKeyConfigOpen(false)}
        config={config}
        onChange={setConfig}
        activeProvider={provider}
        onActiveProviderChange={setProvider}
      />
    </div>
  );
}

export default App;
