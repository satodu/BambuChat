#!/usr/bin/env node

import { spawn } from 'child_process';
import { WebSocketServer } from 'ws';
import http from 'http';

// Parse command line arguments
const args = process.argv.slice(2);
let defaultCommand = '';
let port = 3001;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--command' || args[i] === '-c') {
    defaultCommand = args[i + 1];
    i++;
  } else if (args[i] === '--port' || args[i] === '-p') {
    port = parseInt(args[i + 1], 10);
    i++;
  }
}

// Create HTTP server (CORS proxy + status)
const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version, authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // CORS proxy
  if (req.url === '/proxy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const { url, method = 'POST', headers = {}, body: reqBody } = JSON.parse(body);
        console.log(`[Proxy] Forwarding request to: ${url}`);
        
        const fetchRes = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', ...headers },
          body: reqBody ? JSON.stringify(reqBody) : undefined
        });

        const dataText = await fetchRes.text();
        res.writeHead(fetchRes.status, {
          'Content-Type': fetchRes.headers.get('content-type') || 'application/json'
        });
        res.end(dataText);
      } catch (err) {
        console.error('[Proxy Error]:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('BambuChat MCP Bridge is running!\n');
  }
});

// Start WebSocket server
const wss = new WebSocketServer({ server });

console.log(`WebSocket bridge listening on ws://localhost:${port}`);
console.log(`CORS HTTP proxy endpoint available at http://localhost:${port}/proxy`);
if (defaultCommand) {
  console.log(`Default MCP server command configured: "${defaultCommand}"`);
} else {
  console.log(`Dynamic spawning enabled. Commands can be selected in the BambuChat UI.`);
}

wss.on('connection', (ws) => {
  console.log('Client connected to MCP bridge.');
  let child = null;
  let buffer = '';

  const startProcess = (cmdToRun) => {
    console.log(`Spawning MCP server process: "${cmdToRun}"`);
    try {
      child = spawn(cmdToRun, { shell: true });

      child.stdout.on('data', (data) => {
        buffer += data.toString();
        let lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              JSON.parse(line);
              if (ws.readyState === ws.OPEN) {
                ws.send(line);
              }
            } catch (e) {
              console.error(`[MCP Server stdout (invalid JSON)]: ${line}`);
            }
          }
        }
      });

      child.stderr.on('data', (data) => {
        process.stderr.write(`[MCP Server stderr]: ${data}`);
      });

      child.on('close', (code) => {
        console.log(`MCP server process exited with code ${code}`);
        ws.close(1011, `MCP server process exited with code ${code}`);
      });

      child.on('error', (err) => {
        console.error('Failed to start MCP server process:', err);
        ws.close(1011, `Failed to start process: ${err.message}`);
      });
    } catch (spawnErr) {
      console.error('Exception during spawn:', spawnErr);
      ws.close(1011, `Exception during spawn: ${spawnErr.message}`);
    }
  };

  // If a command-line default command was specified, spawn it immediately
  if (defaultCommand) {
    startProcess(defaultCommand);
  }

  ws.on('message', (message) => {
    try {
      const msgStr = message.toString();

      // Check if this is a custom bridge action to spawn dynamically
      if (!child && msgStr.startsWith('{') && msgStr.includes('bridgeAction')) {
        const payload = JSON.parse(msgStr);
        if (payload.bridgeAction === 'spawn' && payload.command) {
          startProcess(payload.command);
          return;
        }
      }

      // If process is running, forward payload to stdin
      if (child) {
        child.stdin.write(msgStr + '\n');
      } else {
        console.warn('Warning: Received message from browser but no MCP process is running.');
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected.');
    if (child) {
      console.log('Terminating MCP server process...');
      child.kill();
      child = null;
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    if (child) {
      child.kill();
      child = null;
    }
  });
});

server.listen(port);
