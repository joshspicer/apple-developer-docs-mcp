import fetch from 'node-fetch';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

/**
 * Downloads, unzips, and analyzes an Apple Developer code sample from a ZIP file
 * 
 * @param zipUrl URL of the Apple Developer code sample ZIP file
 * @returns Formatted information about the code sample or error response
 */
export async function downloadAndAnalyzeCodeSample(zipUrl: string) {
  try {
    // Validate that this is an Apple docs-assets URL
    if (!zipUrl.includes('docs-assets.developer.apple.com')) {
      throw new Error('URL must be from docs-assets.developer.apple.com');
    }

    console.error(`Downloading code sample from: ${zipUrl}`);
    
    // Create a temporary directory to extract the ZIP file
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'apple-sample-'));
    
    // Download the ZIP file
    const response = await fetch(zipUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to download ZIP file: ${response.status}`);
    }
    
    const zipBuffer = await response.buffer();
    
    // Extract the ZIP file
    const zip = new AdmZip(zipBuffer);
    zip.extractAllTo(tempDir, true);
    
    // Analyze the extracted contents
    const files = await getAllFiles(tempDir);
    
    // Count files by extension
    const fileExtCounts = countFileExtensions(files);
    
    // Get the README content if available
    const readmeContent = await getReadmeContent(tempDir);
    
    // Get some representative code samples
    const codeSamples = await getRepresentativeCodeSamples(tempDir, files);
    
    // Build the content
    let markdownContent = `# Code Sample: ${path.basename(zipUrl, '.zip')}\n\n`;
    markdownContent += `**Source:** [${zipUrl}](${zipUrl})\n\n`;
    
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
        markdownContent += `### ${sample.filePath.replace(tempDir, '')}\n\n`;
        const language = getLanguageFromFilename(sample.filePath);
        markdownContent += `\`\`\`${language}\n${sample.content}\n\`\`\`\n\n`;
      });
    }
    
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
    
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
