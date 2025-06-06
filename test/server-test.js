#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test the MCP server by sending a simple JSON-RPC request
async function testServer() {
  const serverPath = join(__dirname, '../dist/index.js');
  
  console.log('Starting MCP server test...');
  
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  // Test 1: Initialize the server
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };

  server.stdout.on('data', (data) => {
    console.log('Server response:', data.toString());
  });

  server.stderr.on('data', (data) => {
    console.log('Server stderr:', data.toString());
  });

  server.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
  });

  // Send the initialization request
  server.stdin.write(JSON.stringify(initRequest) + '\n');

  // Test 2: List available tools
  setTimeout(() => {
    const listToolsRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {}
    };
    
    server.stdin.write(JSON.stringify(listToolsRequest) + '\n');
  }, 1000);

  // Close after 3 seconds
  setTimeout(() => {
    server.kill();
    console.log('Test completed');
  }, 3000);
}

testServer().catch(console.error);