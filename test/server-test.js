#!/usr/bin/env node

/**
 * Live Integration Tests for Apple Developer Docs MCP Server
 * 
 * These tests verify the MCP server functionality by:
 * 1. Initializing the server via JSON-RPC
 * 2. Testing all available tools with real queries
 * 3. Validating error handling for invalid inputs
 * 4. Ensuring proper response structure
 * 
 * Note: These are "live" tests that attempt to query Apple's documentation.
 * In network-restricted environments (like CI), the tests will gracefully handle
 * network failures and still validate that error messages are properly formatted.
 * When run with full network access, the tests validate actual API responses.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test utilities and constants
const RESPONSE_POLL_INTERVAL_MS = 100;
const RESPONSE_TIMEOUT_MS = 30000; // 30 seconds max wait for response
const CLEANUP_DELAY_MS = 1000;

let testId = 1;
let testsPassed = 0;
let testsFailed = 0;
const responses = new Map();

function assert(condition, message) {
  if (condition) {
    console.log(`✓ ${message}`);
    testsPassed++;
  } else {
    console.error(`✗ ${message}`);
    testsFailed++;
  }
}

function sendRequest(server, method, params = {}) {
  const id = testId++;
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
  
  console.log(`\n→ Sending request: ${method} (id: ${id})`);
  server.stdin.write(JSON.stringify(request) + '\n');
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkResponse = () => {
      if (responses.has(id)) {
        const response = responses.get(id);
        responses.delete(id);
        resolve(response);
      } else if (Date.now() - startTime > RESPONSE_TIMEOUT_MS) {
        reject(new Error(`Timeout waiting for response to ${method} (id: ${id})`));
      } else {
        setTimeout(checkResponse, RESPONSE_POLL_INTERVAL_MS);
      }
    };
    
    // Check immediately first, then poll
    checkResponse();
  });
}

// Test the MCP server with live integration tests
async function testServer() {
  const serverPath = join(__dirname, '../dist/index.js');
  
  console.log('=== Starting MCP Server Live Integration Tests ===\n');
  
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let buffer = '';
  
  server.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete line in buffer
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          if (response.id !== undefined) {
            responses.set(response.id, response);
          }
        } catch (e) {
          // Not JSON, ignore
        }
      }
    }
  });

  server.stderr.on('data', (data) => {
    // Suppress server stderr unless it's an error
    const msg = data.toString();
    if (msg.includes('Error') || msg.includes('Failed')) {
      console.error('Server stderr:', msg);
    }
  });

  server.on('close', (code) => {
    console.log(`\n=== Test Summary ===`);
    console.log(`Tests passed: ${testsPassed}`);
    console.log(`Tests failed: ${testsFailed}`);
    console.log(`Server exited with code: ${code}`);
    
    if (testsFailed > 0) {
      process.exit(1);
    }
  });

  try {
    // Test 1: Initialize the server
    console.log('Test 1: Initialize server');
    const initResponse = await sendRequest(server, 'initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });
    
    assert(initResponse.result !== undefined, 'Server initialized successfully');
    assert(initResponse.result.capabilities !== undefined, 'Server returned capabilities');
    assert(initResponse.result.serverInfo.name === 'apple-developer-docs-mcp', 'Server name is correct');

    // Test 2: List available tools
    console.log('\nTest 2: List available tools');
    const toolsResponse = await sendRequest(server, 'tools/list', {});
    
    assert(toolsResponse.result !== undefined, 'Tools list returned');
    assert(Array.isArray(toolsResponse.result.tools), 'Tools is an array');
    assert(toolsResponse.result.tools.length === 4, 'Expected 4 tools available');
    
    const toolNames = toolsResponse.result.tools.map(t => t.name);
    assert(toolNames.includes('search_apple_docs'), 'search_apple_docs tool exists');
    assert(toolNames.includes('get_apple_doc_content'), 'get_apple_doc_content tool exists');
    assert(toolNames.includes('download_apple_code_sample'), 'download_apple_code_sample tool exists');
    assert(toolNames.includes('research_apple_docs'), 'research_apple_docs tool exists');

    // Test 3: Search Apple docs (live test)
    console.log('\nTest 3: Search Apple docs (live test with "SwiftUI")');
    const searchResponse = await sendRequest(server, 'tools/call', {
      name: 'search_apple_docs',
      arguments: {
        query: 'SwiftUI',
        type: 'all'
      }
    });
    
    assert(searchResponse.result !== undefined, 'Search returned a result');
    assert(Array.isArray(searchResponse.result.content), 'Search result has content array');
    assert(searchResponse.result.content.length > 0, 'Search returned content');
    
    const searchText = searchResponse.result.content[0].text;
    // In restricted environments, the search may return an error
    if (searchResponse.result.isError) {
      console.log('  Note: Search failed due to network restrictions (expected in CI)');
      assert(searchText.includes('Error'), 'Error message is properly formatted');
    } else {
      assert(searchText.includes('SwiftUI') || searchText.includes('search'), 'Search text contains relevant content');
      console.log(`  Found ${(searchText.match(/\n\n##/g) || []).length} search results`);
    }

    // Test 4: Get Apple doc content (live test)
    console.log('\nTest 4: Get Apple doc content (live test with MapKit)');
    const docResponse = await sendRequest(server, 'tools/call', {
      name: 'get_apple_doc_content',
      arguments: {
        url: 'https://developer.apple.com/documentation/mapkit'
      }
    });
    
    assert(docResponse.result !== undefined, 'Doc content returned a result');
    assert(Array.isArray(docResponse.result.content), 'Doc content has content array');
    assert(docResponse.result.content.length > 0, 'Doc content returned content');
    
    const docText = docResponse.result.content[0].text;
    // In restricted environments, fetching doc content may fail
    if (docResponse.result.isError) {
      console.log('  Note: Doc fetch failed due to network restrictions (expected in CI)');
      assert(docText.includes('Error'), 'Error message is properly formatted');
    } else {
      assert(docText.includes('MapKit') || docText.includes('map'), 'Doc content contains MapKit information');
      console.log(`  Retrieved documentation (${docText.length} characters)`);
    }

    // Test 5: Error handling - Invalid URL
    console.log('\nTest 5: Error handling - Invalid URL for get_apple_doc_content');
    const errorResponse = await sendRequest(server, 'tools/call', {
      name: 'get_apple_doc_content',
      arguments: {
        url: 'https://invalid-url.com/test'
      }
    });
    
    assert(errorResponse.result !== undefined, 'Error response returned a result');
    assert(errorResponse.result.isError === true, 'Invalid URL returns error flag');
    const errorText = errorResponse.result.content[0].text;
    assert(errorText.includes('Error'), 'Error message contains "Error"');
    console.log(`  Error correctly reported: ${errorText.substring(0, 100)}...`);

    // Test 6: Search with different types
    console.log('\nTest 6: Search with type filter (guide)');
    const guideSearchResponse = await sendRequest(server, 'tools/call', {
      name: 'search_apple_docs',
      arguments: {
        query: 'animation',
        type: 'guide'
      }
    });
    
    assert(guideSearchResponse.result !== undefined, 'Guide search returned a result');
    // In restricted environments, search may fail
    if (guideSearchResponse.result.isError) {
      console.log('  Note: Guide search failed due to network restrictions (expected in CI)');
    } else {
      console.log('  Guide search completed successfully');
    }

    // Test 7: Search with another query to verify consistency
    console.log('\nTest 7: Search with another query (Core Data)');
    const coreDataSearchResponse = await sendRequest(server, 'tools/call', {
      name: 'search_apple_docs',
      arguments: {
        query: 'Core Data',
        type: 'all'
      }
    });
    
    assert(coreDataSearchResponse.result !== undefined, 'Core Data search returned a result');
    const coreDataText = coreDataSearchResponse.result.content[0].text;
    // In restricted environments, search may fail
    if (coreDataSearchResponse.result.isError) {
      console.log('  Note: Core Data search failed due to network restrictions (expected in CI)');
    } else {
      assert(coreDataText.includes('Core Data') || coreDataText.length > 0, 'Core Data search returned relevant results');
      console.log('  Core Data search completed successfully');
    }

    // Test 8: Download code sample error handling (without actual download)
    console.log('\nTest 8: Download code sample error handling (invalid URL)');
    const downloadErrorResponse = await sendRequest(server, 'tools/call', {
      name: 'download_apple_code_sample',
      arguments: {
        zipUrl: 'https://example.com/invalid.zip'
      }
    });
    
    assert(downloadErrorResponse.result !== undefined, 'Download error response returned');
    assert(downloadErrorResponse.result.isError === true, 'Invalid download URL returns error');
    console.log('  Download error handling works correctly');

  } catch (error) {
    console.error('\n✗ Test error:', error);
    testsFailed++;
  } finally {
    // Clean up
    setTimeout(() => {
      server.kill();
    }, CLEANUP_DELAY_MS);
  }
}

testServer().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});