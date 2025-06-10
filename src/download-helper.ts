import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir, homedir } from 'os';

/**
 * Interface for Apple Documentation JSON with sample code download
 */
interface AppleDocWithSampleJSON {
  sampleCodeDownload?: {
    action?: {
      identifier?: string;
    }
  };
  title?: string;
  identifier?: {
    url?: string;
  };
}

/**
 * Extract the sample code download URL from an Apple Documentation JSON
 * 
 * @param jsonUrl URL of the Apple Documentation JSON
 * @returns The sample code download URL
 */
export async function getSampleCodeDownloadUrl(jsonUrl: string): Promise<string> {
  try {
    console.error(`Fetching download URL from doc JSON: ${jsonUrl}`);
    
    let jsonData: AppleDocWithSampleJSON;
    
    // Handle file:// URLs for testing with local files
    if (jsonUrl.startsWith('file://')) {
      const filePath = new URL(jsonUrl).pathname;
      const fileContent = await fs.readFile(filePath, 'utf-8');
      jsonData = JSON.parse(fileContent);
    } else {
      // Validate that this is an Apple Developer URL for web URLs
      if (!jsonUrl.includes('developer.apple.com')) {
        throw new Error('URL must be from developer.apple.com');
      }
      
      // Fetch the documentation JSON
      const response = await fetch(jsonUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch JSON content: ${response.status}`);
      }

      // Parse the JSON response
      jsonData = await response.json() as AppleDocWithSampleJSON;
    }
    
    // Extract the sample code download identifier
    if (!jsonData.sampleCodeDownload?.action?.identifier) {
      throw new Error('No sample code download URL found in the documentation JSON');
    }
    
    const downloadIdentifier = jsonData.sampleCodeDownload.action.identifier;
    
    // The identifier is already in the format "f14a9bc447c5/DisplayingOverlaysOnAMap.zip"
    // Construct the download URL
    const downloadUrl = `https://docs-assets.developer.apple.com/published/${downloadIdentifier}`;
    
    console.error(`Found sample code download URL: ${downloadUrl}`);
    
    return downloadUrl;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to extract sample code download URL: ${errorMessage}`);
  }
}

/**
 * Downloads, unzips, and analyzes an Apple Developer code sample from a ZIP file
 * Extracts the sample to the user's home directory
 * 
 * @param zipUrl URL of the Apple Developer code sample ZIP file or documentation JSON URL
 * @returns Formatted information about the code sample or error response
 */
export async function downloadAndAnalyzeCodeSample(url: string) {
  try {
    let downloadUrl = url;
    
    // Check if this is a documentation JSON URL or a direct ZIP URL
    if (url.includes('developer.apple.com') && !url.includes('docs-assets.developer.apple.com')) {
      // This is a documentation URL, extract the download URL from it
      try {
        downloadUrl = await getSampleCodeDownloadUrl(url);
      } catch (error) {
        throw new Error(`Failed to get download URL from documentation: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Validate that this is an Apple docs-assets URL
    if (!downloadUrl.includes('docs-assets.developer.apple.com')) {
      throw new Error('URL must be from docs-assets.developer.apple.com');
    }

    console.error(`Downloading code sample from: ${downloadUrl}`);
    
    // Create a samples directory in the user's home directory
    const samplesDir = path.join(homedir(), 'AppleSampleCode');
    try {
      await fs.mkdir(samplesDir, { recursive: true });
    } catch (error) {
      console.error(`Error creating samples directory: ${error}`);
    }
    
    // Extract the sample name from the ZIP URL
    const urlParts = downloadUrl.split('/');
    const filenameWithExt = urlParts[urlParts.length - 1];
    const sampleName = filenameWithExt.replace('.zip', '');
    const extractionDir = path.join(samplesDir, sampleName);
    
    // Check if the sample already exists
    try {
      const stat = await fs.stat(extractionDir);
      if (stat.isDirectory()) {
        console.error(`Sample already exists at: ${extractionDir}`);
      }
    } catch (error) {
      // Directory doesn't exist, which is what we want
    }
    
    // Download the ZIP file
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.status}`);
    }
    
    const zipBuffer = await response.buffer();
    
    // Extract the ZIP file to the user's home directory
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(extractionDir, true);
    
    console.error(`Extracted sample to: ${extractionDir}`);
    
    // Analyze the extracted contents
    const files = await getAllFiles(extractionDir);
    
    // Count files by extension
    const fileExtCounts = countFileExtensions(files);
    
    // Get the README content if available
    const readmeContent = await getReadmeContent(extractionDir);
    
    // Get some representative code samples
    const codeSamples = await getRepresentativeCodeSamples(extractionDir, files);
    
    // Build the content
    let markdownContent = `# Code Sample: ${sampleName}\n\n`;
    markdownContent += `**Source:** [${downloadUrl}](${downloadUrl})\n\n`;
    markdownContent += `**Original URL:** ${url !== downloadUrl ? url : 'Same as download URL'}\n\n`;
    markdownContent += `**Extracted to:** ${extractionDir}\n\n`;
    
    if (readmeContent) {
      markdownContent += `## README\n\n${readmeContent}\n\n`;
    }
    
    markdownContent += `## Contents\n\n`;
    markdownContent += `The sample contains ${files.length} files:\n\n`;
    
    // Add file extension breakdown
    markdownContent += `### File Types\n\n`;
    for (const [ext, count] of Object.entries(fileExtCounts)) {
      markdownContent += `- ${ext}: ${count} files\n`;
    }
    markdownContent += '\n';
    
    // Add representative code samples
    if (codeSamples.length > 0) {
      markdownContent += `## Representative Code Samples\n\n`;
      codeSamples.forEach(sample => {
        const relativePath = path.relative(extractionDir, sample.filePath);
        markdownContent += `### ${relativePath}\n\n`;
        const language = getLanguageFromFilename(sample.filePath);
        markdownContent += `\`\`\`${language}\n${sample.content}\n\`\`\`\n\n`;
      });
    }
    
    // Find and suggest opening interesting files
    const interestingFiles = findInterestingFiles(files);
    if (interestingFiles.length > 0) {
      markdownContent += `## Key Files to Explore\n\n`;
      interestingFiles.forEach(file => {
        const relativePath = path.relative(extractionDir, file);
        markdownContent += `- \`${relativePath}\`\n`;
      });
      markdownContent += '\n';
    }
    
    // Add instructions for opening the project
    markdownContent += `## Opening the Project\n\n`;
    markdownContent += `You can open this project in Xcode by:\n\n`;
    markdownContent += `1. Looking for a .xcodeproj or .xcworkspace file in the extracted directory\n`;
    markdownContent += `2. Double-clicking the project file or opening it from Xcode's "Open..." menu\n\n`;
    markdownContent += `The sample code has been downloaded and extracted to: \`${extractionDir}\`\n`;
    
    return {
      content: [
        {
          type: "text" as const,
          text: markdownContent,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Failed to download and analyze code sample: ${errorMessage}`,
        }
      ],
      isError: true
    };
  }
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dirPath: string): Promise<string[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(dirPath, entry.name);
    return entry.isDirectory() ? getAllFiles(fullPath) : [fullPath];
  }));
  
  return files.flat();
}

/**
 * Count file extensions in the sample
 */
function countFileExtensions(files: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  
  files.forEach(file => {
    const ext = path.extname(file) || '(no extension)';
    counts[ext] = (counts[ext] || 0) + 1;
  });
  
  return counts;
}

/**
 * Get the content of README file if available
 */
async function getReadmeContent(dirPath: string): Promise<string | null> {
  try {
    const entries = await fs.readdir(dirPath);
    
    // Look for README files with various extensions
    const readmeRegex = /^readme(\.(md|txt))?$/i;
    const readmeFile = entries.find(entry => readmeRegex.test(entry));
    
    if (readmeFile) {
      const content = await fs.readFile(path.join(dirPath, readmeFile), 'utf-8');
      return content.substring(0, 2000); // Limit size to prevent too much content
    }
    
    return null;
  } catch (error) {
    console.error('Error reading README:', error);
    return null;
  }
}

/**
 * Get some representative code samples
 */
async function getRepresentativeCodeSamples(dirPath: string, files: string[]): Promise<Array<{filePath: string, content: string}>> {
  const samples: Array<{filePath: string, content: string}> = [];
  
  // Get code files with interesting extensions
  const codeExtensions = ['.swift', '.m', '.h', '.c', '.cpp', '.java', '.kt', '.js', '.py'];
  const codeFiles = files.filter(file => codeExtensions.includes(path.extname(file)));
  
  // Get at most 3 representative files
  const representativeFiles = codeFiles.slice(0, 3);
  
  for (const file of representativeFiles) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      
      // Limit content to a reasonable size
      const limitedContent = content.split('\n').slice(0, 50).join('\n');
      
      samples.push({
        filePath: file,
        content: limitedContent
      });
    } catch (error) {
      console.error(`Error reading code sample ${file}:`, error);
    }
  }
  
  return samples;
}

/**
 * Find interesting files that might be good starting points
 */
function findInterestingFiles(files: string[]): string[] {
  const interestingFiles: string[] = [];
  
  // Look for key files like readmes, main files, etc.
  const patterns = [
    /readme\.(md|txt)/i,                  // README files
    /^main\.(swift|m|java|kt|js)$/i,      // Main files
    /\.xcodeproj$/,                       // Xcode project
    /\.xcworkspace$/,                     // Xcode workspace
    /AppDelegate\.(swift|m)$/,            // iOS app delegate
    /SceneDelegate\.(swift|m)$/,          // iOS scene delegate
    /ViewController\.(swift|m)$/,         // View controllers
    /ContentView\.swift$/,                // SwiftUI content view
    /build\.gradle$/,                     // Android build file
    /index\.(html|js)$/,                  // Web main files
    /package\.json$/                      // Node.js package file
  ];
  
  // Find files matching our patterns
  files.forEach(file => {
    const filename = path.basename(file);
    if (patterns.some(pattern => pattern.test(filename))) {
      interestingFiles.push(file);
    }
  });
  
  // Also add some main.* files directly from the root
  const rootMainFiles = files.filter(file => {
    const dirname = path.dirname(file);
    const filename = path.basename(file);
    return filename.startsWith('Main') && path.basename(dirname) !== 'Resources';
  });
  
  return [...new Set([...interestingFiles, ...rootMainFiles])];
}

/**
 * Get language identifier for code blocks from filename
 */
function getLanguageFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  
  switch (ext) {
    case '.swift': return 'swift';
    case '.m':
    case '.h': return 'objective-c';
    case '.c': return 'c';
    case '.cpp':
    case '.cc':
    case '.cxx': return 'cpp';
    case '.java': return 'java';
    case '.kt': return 'kotlin';
    case '.js': return 'javascript';
    case '.py': return 'python';
    case '.rb': return 'ruby';
    case '.sh': return 'bash';
    case '.json': return 'json';
    case '.xml': return 'xml';
    case '.md': return 'markdown';
    default: return '';
  }
}
