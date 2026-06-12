import type { McpTool } from './mcp';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
  }[];
  toolCallId?: string; // Used by OpenAI/Claude to match response
  toolName?: string;   // Name of the tool executed
  geminiParts?: any[]; // Save raw parts for Gemini (e.g. thoughtSignature)
}

interface GenerateMessageOptions {
  provider: 'gemini' | 'openai' | 'claude';
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  tools: McpTool[];
  bridgeUrl?: string; // Optional websocket bridge url, e.g. ws://localhost:3001
}

interface GenerateMessageResult {
  content: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, any>;
  }[];
  geminiParts?: any[]; // Save raw parts for Gemini
}

// Utility to handle fetch calls, proxying through the bridge if available to bypass CORS (vital for Claude)
async function apiFetch(
  url: string,
  options: { method: string; headers: Record<string, string>; body: any },
  bridgeUrl?: string
): Promise<any> {
  const shouldUseProxy = !!bridgeUrl;

  if (shouldUseProxy) {
    try {
      // Convert ws://localhost:3001 to http://localhost:3001/proxy
      const httpUrl = bridgeUrl.replace(/^ws(s)?:\/\//i, 'http$1://');
      const proxyEndpoint = `${httpUrl}/proxy`;

      const response = await fetch(proxyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: options.method,
          headers: options.headers,
          body: options.body
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Proxy call failed (${response.status}): ${errorText}`);
      }

      return response.json();
    } catch (err) {
      console.warn('Proxy fetch failed, attempting direct fetch:', err);
    }
  }

  // Direct fetch fallback
  const response = await fetch(url, {
    method: options.method,
    headers: options.headers,
    body: JSON.stringify(options.body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API call failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function generateMessage({
  provider,
  apiKey,
  model,
  messages,
  systemPrompt,
  tools,
  bridgeUrl
}: GenerateMessageOptions): Promise<GenerateMessageResult> {
  if (provider === 'openai') {
    return callOpenAI(apiKey, model, messages, systemPrompt, tools, bridgeUrl);
  } else if (provider === 'gemini') {
    return callGemini(apiKey, model, messages, systemPrompt, tools, bridgeUrl);
  } else if (provider === 'claude') {
    return callClaude(apiKey, model, messages, systemPrompt, tools, bridgeUrl);
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

// ==========================================
// OpenAI Implementation
// ==========================================
async function callOpenAI(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  tools: McpTool[],
  bridgeUrl?: string
): Promise<GenerateMessageResult> {
  const url = 'https://api.openai.com/v1/chat/completions';
  
  // Format messages
  const formattedMessages: any[] = [];
  if (systemPrompt) {
    formattedMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    if (msg.role === 'user') {
      formattedMessages.push({ role: 'user', content: msg.content });
    } else if (msg.role === 'assistant') {
      const formattedMsg: any = { role: 'assistant', content: msg.content || null };
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        formattedMsg.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        }));
      }
      formattedMessages.push(formattedMsg);
    } else if (msg.role === 'tool') {
      formattedMessages.push({
        role: 'tool',
        tool_call_id: msg.toolCallId,
        name: msg.toolName,
        content: msg.content
      });
    }
  }

  // Format tools
  const openAiTools = tools.length > 0 ? tools.map(t => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description || '',
      parameters: t.inputSchema
    }
  })) : undefined;

  const responseBody = {
    model: model || 'gpt-4o-mini',
    messages: formattedMessages,
    tools: openAiTools
  };

  const headers = {
    'Authorization': `Bearer ${apiKey}`
  };

  const response = await apiFetch(url, { method: 'POST', headers, body: responseBody }, bridgeUrl);
  const choice = response.choices?.[0]?.message;

  if (!choice) {
    throw new Error('Invalid response received from OpenAI API');
  }

  const result: GenerateMessageResult = {
    content: choice.content || ''
  };

  if (choice.tool_calls && choice.tool_calls.length > 0) {
    result.toolCalls = choice.tool_calls.map((tc: any) => {
      let args = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch (e) {
        console.error('Failed to parse OpenAI tool arguments:', tc.function.arguments);
      }
      return {
        id: tc.id,
        name: tc.function.name,
        arguments: args
      };
    });
  }

  return result;
}

// ==========================================
// Gemini Implementation
// ==========================================
async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  tools: McpTool[],
  bridgeUrl?: string
): Promise<GenerateMessageResult> {
  const modelName = model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  // Gemini contents array formatting
  const contents: any[] = [];
  
  // Note: Gemini API requires mapping tools, tool requests, and responses into parts.
  // In Gemini, all tool calls are role: 'model', tool responses are role: 'function'.
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user') {
      contents.push({
        role: 'user',
        parts: [{ text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      if (msg.geminiParts && msg.geminiParts.length > 0) {
        contents.push({ role: 'model', parts: msg.geminiParts });
      } else {
        const parts: any[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments
              }
            });
          }
        }
        contents.push({ role: 'model', parts });
      }
    } else if (msg.role === 'tool') {
      // Try to parse the result into an object since Gemini functionResponse expects a key-value structure
      let responseObj: any = { response: msg.content };
      try {
        const parsed = JSON.parse(msg.content);
        responseObj = typeof parsed === 'object' && parsed !== null ? parsed : { response: parsed };
      } catch (e) {
        // Leave as is
      }

      contents.push({
        role: 'function',
        parts: [{
          functionResponse: {
            name: msg.toolName || '',
            response: responseObj
          }
        }]
      });
    }
  }

  // Format tools to Gemini's declarations
  const geminiTools = tools.length > 0 ? [{
    functionDeclarations: tools.map(t => {
      // Map JSON schema to Gemini Schema: Gemini requires property types to be uppercase string, e.g., "STRING" instead of "string"
      const mapProperties = (props: Record<string, any> | undefined): any => {
        if (!props) return undefined;
        const newProps: Record<string, any> = {};
        for (const [key, value] of Object.entries(props)) {
          newProps[key] = {
            ...value,
            type: (value.type as string).toUpperCase()
          };
          if (value.properties) {
            newProps[key].properties = mapProperties(value.properties);
          }
        }
        return newProps;
      };

      return {
        name: t.name,
        description: t.description || '',
        parameters: {
          type: (t.inputSchema.type || 'object').toUpperCase(),
          properties: mapProperties(t.inputSchema.properties),
          required: t.inputSchema.required
        }
      };
    })
  }] : undefined;

  const responseBody: any = {
    contents,
    tools: geminiTools
  };

  if (systemPrompt) {
    responseBody.systemInstruction = {
      parts: [{ text: systemPrompt }]
    };
  }

  const response = await apiFetch(url, { method: 'POST', headers: {}, body: responseBody }, bridgeUrl);
  const candidate = response.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  
  let contentText = '';
  const toolCalls: any[] = [];

  for (const part of parts) {
    if (part.text) {
      contentText += part.text;
    }
    if (part.functionCall) {
      toolCalls.push({
        // For Gemini, we synthesize a random tool ID or just use its name
        id: `call_${part.functionCall.name}_${Math.random().toString(36).substr(2, 9)}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {}
      });
    }
  }

  const result: GenerateMessageResult = {
    content: contentText,
    geminiParts: parts
  };

  if (toolCalls.length > 0) {
    result.toolCalls = toolCalls;
  }

  return result;
}

// ==========================================
// Claude Implementation
// ==========================================
async function callClaude(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemPrompt: string,
  tools: McpTool[],
  bridgeUrl?: string
): Promise<GenerateMessageResult> {
  const url = 'https://api.anthropic.com/v1/messages';

  // Format messages for Claude (roles must alternate user/assistant, system is separate)
  const formattedMessages: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'user') {
      formattedMessages.push({
        role: 'user',
        content: [{ type: 'text', text: msg.content }]
      });
    } else if (msg.role === 'assistant') {
      const contentList: any[] = [];
      if (msg.content) {
        contentList.push({ type: 'text', text: msg.content });
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          contentList.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments
          });
        }
      }
      formattedMessages.push({
        role: 'assistant',
        content: contentList
      });
    } else if (msg.role === 'tool') {
      // Claude permits tool results as blocks inside user messages
      // We look back to see if we can append this block to the previous user message,
      // or create a new user message containing this tool result.
      const lastMsg = formattedMessages[formattedMessages.length - 1];
      const block = {
        type: 'tool_result',
        tool_use_id: msg.toolCallId,
        content: msg.content
      };

      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
        lastMsg.content.push(block);
      } else {
        formattedMessages.push({
          role: 'user',
          content: [block]
        });
      }
    }
  }

  // Format tools for Claude
  const claudeTools = tools.length > 0 ? tools.map(t => ({
    name: t.name,
    description: t.description || '',
    input_schema: t.inputSchema
  })) : undefined;

  const responseBody: any = {
    model: model || 'claude-3-5-sonnet-20241022',
    max_tokens: 4096,
    messages: formattedMessages,
    tools: claudeTools
  };

  if (systemPrompt) {
    responseBody.system = systemPrompt;
  }

  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };

  const response = await apiFetch(url, { method: 'POST', headers, body: responseBody }, bridgeUrl);
  const content = response.content || [];
  
  let contentText = '';
  const toolCalls: any[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      contentText += block.text;
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: block.id,
        name: block.name,
        arguments: block.input || {}
      });
    }
  }

  const result: GenerateMessageResult = {
    content: contentText
  };

  if (toolCalls.length > 0) {
    result.toolCalls = toolCalls;
  }

  return result;
}
