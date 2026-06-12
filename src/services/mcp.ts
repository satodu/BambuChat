export interface McpTool {
  name: string;
  description?: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
    [key: string]: any;
  };
}

export interface McpMessageLog {
  timestamp: string;
  direction: 'sent' | 'received';
  payload: any;
}

type MessageLogCallback = (log: McpMessageLog) => void;
type ConnectionStatusCallback = (status: 'disconnected' | 'connecting' | 'connected' | 'error', errorMsg?: string) => void;

export class McpClient {
  private socket: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private ssePostUrl: string = '';
  private nextId = 1;
  private pendingRequests = new Map<number | string, { resolve: (res: any) => void; reject: (err: any) => void }>();
  
  private messageCallbacks: MessageLogCallback[] = [];
  private statusCallbacks: ConnectionStatusCallback[] = [];
  
  public status: 'disconnected' | 'connecting' | 'connected' | 'error' = 'disconnected';
  public tools: McpTool[] = [];
  public serverInfo: { name: string; version: string } | null = null;

  constructor() {}

  // Subscribe to raw JSON-RPC traffic
  public onMessage(callback: MessageLogCallback) {
    this.messageCallbacks.push(callback);
    return () => {
      this.messageCallbacks = this.messageCallbacks.filter(cb => cb !== callback);
    };
  }

  // Subscribe to connection status changes
  public onStatusChange(callback: ConnectionStatusCallback) {
    this.statusCallbacks.push(callback);
    // Initial trigger
    callback(this.status);
    return () => {
      this.statusCallbacks = this.statusCallbacks.filter(cb => cb !== callback);
    };
  }

  private setStatus(status: typeof this.status, errorMsg?: string) {
    this.status = status;
    this.statusCallbacks.forEach(cb => cb(status, errorMsg));
  }

  private logMessage(direction: 'sent' | 'received', payload: any) {
    const log: McpMessageLog = {
      timestamp: new Date().toLocaleTimeString(),
      direction,
      payload
    };
    this.messageCallbacks.forEach(cb => cb(log));
  }

  // Connect via local WebSocket bridge
  public async connectWebSocket(url: string, spawnCommand?: string): Promise<void> {
    this.disconnect();
    this.setStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(url);

        this.socket.onopen = async () => {
          this.setStatus('connected');
          try {
            if (spawnCommand && this.socket) {
              const handshake = {
                bridgeAction: 'spawn',
                command: spawnCommand
              };
              this.socket.send(JSON.stringify(handshake));
              this.logMessage('sent', handshake);
            }
            await this.initializeMcp();
            resolve();
          } catch (err) {
            this.setStatus('error', 'MCP initialization failed: ' + (err as Error).message);
            reject(err);
          }
        };

        this.socket.onmessage = (event) => {
          this.handleRawMessage(event.data);
        };

        this.socket.onclose = (event) => {
          this.setStatus('disconnected');
          if (event.code !== 1000 && event.code !== 1005) {
            this.setStatus('error', `WebSocket closed: ${event.reason || 'Code ' + event.code}`);
          }
        };

        this.socket.onerror = () => {
          this.setStatus('error', 'WebSocket connection failed.');
          reject(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        this.setStatus('error', (err as Error).message);
        reject(err);
      }
    });
  }

  // Connect via SSE (Server-Sent Events)
  public async connectSSE(url: string): Promise<void> {
    this.disconnect();
    this.setStatus('connecting');

    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
          // Note: Wait for the 'endpoint' event to determine the upload URL
          console.log('SSE Stream opened, waiting for endpoint mapping...');
        };

        this.eventSource.addEventListener('endpoint', async (event: any) => {
          try {
            const endpointStr = event.data;
            this.ssePostUrl = new URL(endpointStr, url).toString();
            this.setStatus('connected');
            
            // Now initialize MCP
            await this.initializeMcp();
            resolve();
          } catch (err) {
            this.setStatus('error', 'MCP initialization failed: ' + (err as Error).message);
            reject(err);
          }
        });

        this.eventSource.onmessage = (event) => {
          this.handleRawMessage(event.data);
        };

        this.eventSource.onerror = () => {
          this.setStatus('error', 'SSE connection failed.');
          reject(new Error('SSE connection failed'));
        };
      } catch (err) {
        this.setStatus('error', (err as Error).message);
        reject(err);
      }
    });
  }

  // Disconnect active session
  public disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.ssePostUrl = '';
    this.tools = [];
    this.serverInfo = null;
    this.setStatus('disconnected');
    
    // Reject any leftover promises
    this.pendingRequests.forEach(req => req.reject(new Error('Disconnected')));
    this.pendingRequests.clear();
  }

  // Raw message dispatcher
  private handleRawMessage(dataStr: string) {
    let payload: any;
    try {
      payload = JSON.parse(dataStr);
    } catch (e) {
      console.error('Failed to parse incoming JSON-RPC message:', dataStr);
      return;
    }

    this.logMessage('received', payload);

    if (payload.id !== undefined) {
      const pending = this.pendingRequests.get(payload.id);
      if (pending) {
        this.pendingRequests.delete(payload.id);
        if (payload.error) {
          pending.reject(payload.error);
        } else {
          pending.resolve(payload.result);
        }
      }
    } else {
      // Server-to-client notifications or requests
      console.log('Received notification/request from server:', payload);
    }
  }

  // Sends request and returns a promise resolving with JSON-RPC result
  private async sendRequest(method: string, params: any = {}): Promise<any> {
    if (this.status !== 'connected') {
      throw new Error('MCP Client is not connected');
    }

    const id = this.nextId++;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      this.logMessage('sent', payload);

      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(payload));
      } else if (this.eventSource && this.ssePostUrl) {
        // SSE requests are sent via HTTP POST to the established endpoint
        fetch(this.ssePostUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        }).catch(err => {
          this.pendingRequests.delete(id);
          this.logMessage('received', { error: `Failed to post request: ${err.message}` });
          reject(err);
        });
      } else {
        this.pendingRequests.delete(id);
        reject(new Error('No active transport available'));
      }
    });
  }

  // Initialize MCP protocol handshake
  private async initializeMcp() {
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'BambuChat-Client',
        version: '1.0.0'
      }
    });

    this.serverInfo = initResult.serverInfo;

    // Send initialized notification (no id response needed)
    const initNotification = {
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    };
    this.logMessage('sent', initNotification);

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(initNotification));
    } else if (this.eventSource && this.ssePostUrl) {
      fetch(this.ssePostUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(initNotification)
      }).catch(err => console.error('Failed to send initialized notification:', err));
    }

    // Immediately fetch tools
    await this.refreshTools();
  }

  // Fetch / Refresh available tools
  public async refreshTools(): Promise<McpTool[]> {
    try {
      const response = await this.sendRequest('tools/list');
      this.tools = response.tools || [];
      return this.tools;
    } catch (err) {
      console.error('Failed to retrieve MCP tools:', err);
      this.tools = [];
      throw err;
    }
  }

  // Call a tool on the MCP server
  public async callTool(name: string, args: Record<string, any> = {}): Promise<any> {
    return this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }
}
