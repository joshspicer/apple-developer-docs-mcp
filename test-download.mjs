import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const exampleJsonPath = path.join(__dirname, 'examples/download_apple_code_sample/tutorials/data/documentation/mapkit/displaying-overlays-on-a-map.json');

// Read the file directly
const fileContent = readFileSync(exampleJsonPath, 'utf-8');
const jsonData = JSON.parse(fileContent);

// Extract the download URL
if (jsonData.sampleCodeDownload?.action?.identifier) {
  const downloadIdentifier = jsonData.sampleCodeDownload.action.identifier;
  // The correct URL format from Apple's website
  const downloadUrl = `https://docs-assets.developer.apple.com/published/${downloadIdentifier}`;
  console.log('Download URL:', downloadUrl);
  
  // The full expected URL:
  console.log('Full URL from JSON:', jsonData.sampleCodeDownload.action);
} else {
  console.error('No sample code download URL found in the documentation JSON');
}
