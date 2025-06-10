#!/usr/bin/env node

/**
 * A utility script to extract the ZIP URL from Apple documentation JSON.
 * 
 * Usage:
 *   node extract-zip-url.js [JSON string or file path]
 * 
 * Example with JSON string:
 *   node extract-zip-url.js '{"sampleCodeDownload":{"action":{"identifier":"f14a9bc447c5/DisplayingOverlaysOnAMap.zip"}}}'
 * 
 * Example with file:
 *   node extract-zip-url.js path/to/doc-response.json
 */

import fs from 'fs/promises';
import path from 'path';

async function main() {
  if (process.argv.length < 3) {
    console.error('Please provide a JSON string or file path as an argument');
    console.error('Usage: node extract-zip-url.js [JSON string or file path]');
    process.exit(1);
  }

  const input = process.argv[2];
  let jsonData;

  try {
    // Check if the input is a file path
    if (input.endsWith('.json') && await fileExists(input)) {
      const fileContent = await fs.readFile(input, 'utf-8');
      jsonData = JSON.parse(fileContent);
      console.log(`Parsed JSON from file: ${input}`);
    } else {
      // Assume it's a JSON string
      jsonData = JSON.parse(input);
      console.log('Parsed JSON from input string');
    }

    // Look for the identifier in the expected path
    if (!jsonData.sampleCodeDownload?.action?.identifier) {
      console.error('\nError: No sample code download identifier found in the JSON');
      console.error('Expected to find: sampleCodeDownload.action.identifier\n');
      
      // Try to help the user by looking for the identifier in other places
      findPossibleIdentifiers(jsonData);
      process.exit(1);
    }

    const identifier = jsonData.sampleCodeDownload.action.identifier;
    const zipUrl = `https://docs-assets.developer.apple.com/published/${identifier}`;

    console.log('\nFound sample code download information:');
    console.log(`- Identifier: ${identifier}`);
    console.log(`- Complete ZIP URL: ${zipUrl}`);
    console.log('\nUse this URL with the download_apple_code_sample tool:');
    console.log(`mcp_apple-develop_download_apple_code_sample zipUrl="${zipUrl}"`);

  } catch (error) {
    console.error(`\nError: ${error.message}`);
    console.error('\nMake sure your JSON is valid and contains the sampleCodeDownload information');
    process.exit(1);
  }
}

// Helper function to check if a file exists
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Helper function to recursively search for anything that might be an identifier
function findPossibleIdentifiers(obj, path = '') {
  const possibleMatches = [];

  function search(o, p) {
    if (o === null || typeof o !== 'object') return;
    
    if (typeof o === 'object') {
      for (const key in o) {
        const currentPath = p ? `${p}.${key}` : key;
        
        // Look for keys that might contain download information
        if (['identifier', 'download', 'url', 'link', 'href'].includes(key.toLowerCase())) {
          if (typeof o[key] === 'string' && o[key].includes('.zip')) {
            possibleMatches.push({
              path: currentPath,
              value: o[key]
            });
          }
        }
        
        search(o[key], currentPath);
      }
    }
  }

  search(obj, path);
  
  if (possibleMatches.length > 0) {
    console.log('\nPossible download identifiers found:');
    possibleMatches.forEach(match => {
      console.log(`- Path: ${match.path}`);
      console.log(`  Value: ${match.value}`);
      
      // If it looks like a complete URL, suggest using it directly
      if (match.value.startsWith('http')) {
        console.log(`  Use directly: mcp_apple-develop_download_apple_code_sample zipUrl="${match.value}"`);
      } 
      // If it looks like an identifier, suggest constructing the URL
      else if (match.value.includes('.zip')) {
        const zipUrl = `https://docs-assets.developer.apple.com/published/${match.value}`;
        console.log(`  Possible URL: mcp_apple-develop_download_apple_code_sample zipUrl="${zipUrl}"`);
      }
      console.log('');
    });
  } else {
    console.log('\nNo possible download identifiers found in the JSON');
  }
}

main().catch(console.error);
