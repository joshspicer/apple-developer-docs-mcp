import * as cheerio from 'cheerio';

/**
 * Format JSON documentation from Apple Developer Documentation
 */
export function formatJsonDocumentation(jsonData: any, url: string) {
  try {
    // Extract the key information from the JSON structure
    const title = jsonData.title || jsonData.metadata?.title || 'Untitled Documentation';
    
    // Initialize the content sections
    let markdownContent = `# ${title}\n\n`;
    markdownContent += `**Source:** [${url}](${url})\n\n`;
    
    // Add abstract/introduction if available
    if (jsonData.abstract && jsonData.abstract.length > 0) {
      const abstractText = jsonData.abstract.map((item: any) => {
        if (item.text) return item.text;
        if (item.inlineContent) {
          return item.inlineContent.map((content: any) => content.text || '').join('');
        }
        return '';
      }).join(' ');
      
      markdownContent += `## Overview\n\n${abstractText}\n\n`;
    }

    // Add declaration if available
    if (jsonData.primaryContentSections) {
      const declarationSection = jsonData.primaryContentSections.find(
        (section: any) => section.kind === 'declarations'
      );
      
      if (declarationSection && declarationSection.declarations) {
        markdownContent += `## Declaration\n\n\`\`\`swift\n`;
        declarationSection.declarations.forEach((declaration: any) => {
          if (declaration.tokens) {
            const declarationText = declaration.tokens
              .map((token: any) => token.text || '')
              .join('');
            markdownContent += `${declarationText}\n`;
          }
        });
        markdownContent += `\`\`\`\n\n`;
      }

      // Add discussion/description if available
      const discussionSection = jsonData.primaryContentSections.find(
        (section: any) => section.kind === 'content'
      );
      
      if (discussionSection && discussionSection.content) {
        markdownContent += `## Description\n\n`;
        discussionSection.content.forEach((content: any) => {
          if (content.type === 'paragraph' && content.inlineContent) {
            const paragraphText = content.inlineContent
              .map((inline: any) => inline.text || '')
              .join('');
            markdownContent += `${paragraphText}\n\n`;
          } else if (content.type === 'heading') {
            markdownContent += `### ${content.text}\n\n`;
          } else if (content.type === 'codeBlock') {
            markdownContent += `\`\`\`${content.syntax || ''}\n${content.code || ''}\n\`\`\`\n\n`;
          }
        });
      }
    }
    
    // Add platform availability information
    if (jsonData.availability) {
      markdownContent += `## Availability\n\n`;
      Object.entries(jsonData.availability).forEach(([platform, info]: [string, any]) => {
        markdownContent += `- **${platform}**: ${info.introduced || 'N/A'}\n`;
      });
      markdownContent += `\n`;
    }
    
    // Add topics/subtopics if available
    if (jsonData.topics && jsonData.topics.length > 0) {
      markdownContent += `## Topics\n\n`;
      jsonData.topics.forEach((topic: any) => {
        if (topic.title) {
          markdownContent += `### ${topic.title}\n\n`;
        }
        
        if (topic.identifiers && topic.identifiers.length > 0) {
          topic.identifiers.forEach((identifier: string) => {
            const reference = jsonData.references && jsonData.references[identifier];
            if (reference) {
              markdownContent += `- [${reference.title || identifier}](https://developer.apple.com/documentation/${reference.url || identifier})\n`;
            }
          });
          markdownContent += `\n`;
        }
      });
    }
    
    // Add related items if available
    if (jsonData.relationshipsSections && jsonData.relationshipsSections.length > 0) {
      markdownContent += `## Related\n\n`;
      jsonData.relationshipsSections.forEach((section: any) => {
        if (section.title) {
          markdownContent += `### ${section.title}\n\n`;
        }
        
        if (section.identifiers && section.identifiers.length > 0) {
          section.identifiers.forEach((identifier: string) => {
            const reference = jsonData.references && jsonData.references[identifier];
            if (reference) {
              markdownContent += `- [${reference.title || identifier}](https://developer.apple.com/documentation/${reference.url || identifier})\n`;
            }
          });
          markdownContent += `\n`;
        }
      });
    }

    return {
      content: [
        {
          type: "text" as const,
          text: markdownContent,
        },
      ],
    };
  } catch (error) {
    console.error('Error formatting JSON documentation:', error);
    // Return a simplified version if parsing fails
    return {
      content: [
        {
          type: "text" as const,
          text: `# Documentation: ${url}\n\nUnable to parse the full documentation content. Please visit the original documentation page for complete information.`,
        },
      ],
    };
  }
}

/**
 * Format HTML documentation from Apple Developer Documentation
 */
export function formatHtmlDocumentation(html: string, url: string) {
  try {
    const $ = cheerio.load(html);
    
    // Extract the title
    const title = $('h1').first().text().trim() || $('title').text().trim();
    
    // Initialize the content
    let markdownContent = `# ${title}\n\n`;
    markdownContent += `**Source:** [${url}](${url})\n\n`;
    
    // Extract main content
    const mainContent = $('.documentation-main').first();
    if (mainContent.length > 0) {
      // Extract the description/overview
      const description = mainContent.find('.description, .abstract, .content-section').first();
      if (description.length > 0) {
        markdownContent += `## Overview\n\n${description.text().trim()}\n\n`;
      }
      
      // Extract code examples
      const codeBlocks = mainContent.find('pre code');
      if (codeBlocks.length > 0) {
        markdownContent += `## Code Examples\n\n`;
        codeBlocks.each((i, element) => {
          const code = $(element).text().trim();
          const language = $(element).attr('class') || '';
          const lang = language.includes('swift') ? 'swift' : 
                      language.includes('objective-c') ? 'objective-c' : '';
          
          markdownContent += `\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
        });
      }
      
      // Extract topics/subtopics
      const topics = mainContent.find('.topics-section');
      if (topics.length > 0) {
        markdownContent += `## Topics\n\n`;
        topics.each((i, element) => {
          const topicTitle = $(element).find('.topics-section-title').text().trim();
          if (topicTitle) {
            markdownContent += `### ${topicTitle}\n\n`;
          }
          
          $(element).find('.topic').each((j, topicItem) => {
            const topicLink = $(topicItem).find('a');
            const topicText = topicLink.text().trim();
            const topicUrl = topicLink.attr('href');
            
            if (topicText && topicUrl) {
              const fullUrl = topicUrl.startsWith('http') ? 
                topicUrl : `https://developer.apple.com${topicUrl}`;
              markdownContent += `- [${topicText}](${fullUrl})\n`;
            }
          });
          
          markdownContent += `\n`;
        });
      }
    } else {
      // Fallback for when the main content container isn't found
      // Remove scripts, styles, and navigation elements
      $('script, style, nav, header, footer').remove();
      
      // Extract the remaining text content
      let content = $('body').text().trim();
      content = content.replace(/\s+/g, ' ').substring(0, 6000);
      
      markdownContent += `## Content\n\n${content}\n\n`;
    }
    
    return {
      content: [
        {
          type: "text" as const,
          text: markdownContent,
        },
      ],
    };
  } catch (error) {
    console.error('Error formatting HTML documentation:', error);
    // Return a simplified version if parsing fails
    return {
      content: [
        {
          type: "text" as const,
          text: `# Documentation: ${url}\n\nUnable to parse the full documentation content. Please visit the original documentation page for complete information.`,
        },
      ],
    };
  }
}
