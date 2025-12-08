import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

type SlideResult = { id: string; ok: boolean; ms: number; err?: string; rawSnippet?: string; skipped?: boolean };

type YouTubeVideo = {
  youtube_id: string;
  title: string;
  description?: string;
  thumbnail_url: string;
  duration?: number; // in seconds
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });

function truncate(input: string, max = 3000): string {
  if (!input) return "";
  return input.length <= max ? input : input.slice(0, max);
}

function parseJsonish(text: string): { title?: string; subpoints?: string[] } | null {
  if (!text) {
    console.warn(`[parseJsonish] Empty text provided`);
    return null;
  }
  
  // Clean up text - remove markdown code blocks
  let cleaned = text.trim();
  
  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  
  // Try direct parse first
  try {
    const parsed = JSON.parse(cleaned);
    console.log(`[parseJsonish] Successfully parsed JSON directly`);
    return parsed;
  } catch (e) {
    console.log(`[parseJsonish] Direct parse failed, trying to extract JSON object`);
  }
  
  // Check if JSON appears to be truncated (ends mid-string or mid-array)
  const isTruncated = /"[\s\n]*$|\[[\s\n]*$|,[\s\n]*$/.test(cleaned);
  if (isTruncated) {
    console.warn(`[parseJsonish] JSON appears truncated, attempting to repair...`);
    
    // Try to repair truncated JSON by finding complete parts
    try {
      // Extract title (even if truncated)
      const titleMatch = cleaned.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"?/);
      const title = titleMatch && titleMatch[1] ? titleMatch[1] : "Untitled Topic";
      
      // Extract subpoints - find all complete string entries in the array
      const subpointsMatch = cleaned.match(/"subpoints"\s*:\s*\[(.*)/s);
      const subpoints: string[] = [];
      
      if (subpointsMatch) {
        const subpointsContent = subpointsMatch[1];
        // Match complete quoted strings (handling escaped quotes)
        const stringPattern = /"((?:[^"\\]|\\.)*)"/g;
        let match;
        while ((match = stringPattern.exec(subpointsContent)) !== null) {
          subpoints.push(match[1]);
        }
      }
      
      // If we found at least the title or some subpoints, return repaired object
      if (title !== "Untitled Topic" || subpoints.length > 0) {
        const repaired = { title, subpoints };
        console.log(`[parseJsonish] Successfully repaired truncated JSON: title="${title}", ${subpoints.length} subpoints`);
        return repaired;
      }
    } catch (repairError) {
      console.warn(`[parseJsonish] Repair attempt failed:`, repairError);
    }
  }
  
  // Try to extract first top-level JSON object
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const maybe = cleaned.slice(start, end + 1);
    try { 
      const parsed = JSON.parse(maybe);
      console.log(`[parseJsonish] Successfully parsed extracted JSON object`);
      return parsed;
    } catch (e) {
      console.warn(`[parseJsonish] Failed to parse extracted JSON:`, e);
    }
  }
  
  // Try to find JSON array pattern
  const arrayStart = cleaned.indexOf("[");
  const arrayEnd = cleaned.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    const maybeArray = cleaned.slice(arrayStart, arrayEnd + 1);
    try {
      const parsed = JSON.parse(maybeArray);
      console.warn(`[parseJsonish] Got array instead of object, attempting to convert`);
      // If we got an array, try to use first element
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
        return parsed[0];
      }
    } catch (e) {
      // Ignore
    }
  }
  
  console.error(`[parseJsonish] Failed to parse JSON. Text preview: ${text.substring(0, 300)}`);
  return null;
}

// Simple rate limiter: track last call time and enforce minimum delay
let lastGeminiCallTime = 0;
const MIN_DELAY_BETWEEN_CALLS_MS = 1000; // 1 second minimum between calls for free tier

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geminiCall(key: string, model: string, parts: any[], config?: { maxOutputTokens?: number; responseMimeType?: string }, retryCount = 0): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: config?.maxOutputTokens ?? 768,
      responseMimeType: config?.responseMimeType ?? "application/json",
    },
  };
  
  // Rate limiting: ensure minimum delay between calls
  const now = Date.now();
  const timeSinceLastCall = now - lastGeminiCallTime;
  if (timeSinceLastCall < MIN_DELAY_BETWEEN_CALLS_MS) {
    const waitTime = MIN_DELAY_BETWEEN_CALLS_MS - timeSinceLastCall;
    console.log(`[geminiCall] Rate limiting: waiting ${waitTime}ms before next call`);
    await delay(waitTime);
  }
  lastGeminiCallTime = Date.now();
  
  console.log(`[geminiCall] Calling Gemini API with model: ${model}, parts: ${parts.length}, attempt: ${retryCount + 1}`);
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  
  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => resp.statusText);
    let errJson: any = null;
    try {
      errJson = JSON.parse(errTxt);
    } catch {
      // Not JSON, ignore
    }
    
    // Handle 429 rate limit errors with retry
    if (resp.status === 429) {
      // Extract retry delay from error response
      let retryDelay = 30000; // Default 30 seconds
      if (errJson?.error?.details) {
        for (const detail of errJson.error.details) {
          if (detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo" && detail.retryDelay) {
            // retryDelay is in seconds, convert to milliseconds
            retryDelay = parseFloat(detail.retryDelay) * 1000;
            break;
          }
        }
      }
      
      // Retry with exponential backoff (max 3 retries)
      if (retryCount < 3) {
        console.warn(`[geminiCall] Rate limited (429), retrying after ${retryDelay}ms (attempt ${retryCount + 1}/3)`);
        await delay(retryDelay);
        return geminiCall(key, model, parts, config, retryCount + 1);
      } else {
        console.error(`[geminiCall] Rate limit exceeded after ${retryCount + 1} attempts`);
        throw new Error(`Gemini API rate limit exceeded. Please wait and try again later. Quota: ${errJson?.error?.details?.find((d: any) => d["@type"]?.includes("QuotaFailure"))?.violations?.[0]?.quotaValue || "unknown"} requests/day`);
      }
    }
    
    console.error(`[geminiCall] Gemini API error: ${resp.status} ${errTxt}`);
    throw new Error(`Gemini ${model} ${resp.status} ${errTxt}`);
  }
  
  const result = await resp.json();
  console.log(`[geminiCall] Gemini API response received, candidates: ${result?.candidates?.length ?? 0}`);
  
  // Check if response has blocked content
  if (result?.promptFeedback?.blockReason) {
    console.warn(`[geminiCall] Content blocked: ${result.promptFeedback.blockReason}`);
    throw new Error(`Content blocked: ${result.promptFeedback.blockReason}`);
  }
  
  return result;
}

/**
 * Search YouTube using the YouTube Data API v3
 * Returns up to 10 videos matching the query
 */
async function searchYouTube(apiKey: string, query: string): Promise<YouTubeVideo[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn("[searchYouTube] YOUTUBE_API_KEY not provided, returning empty results");
    return [];
  }

  console.log(`[searchYouTube] Starting search for query: "${query}"`);
  
  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=10&q=${encodeURIComponent(query)}&type=video&key=${encodeURIComponent(apiKey)}`;
    console.log(`[searchYouTube] Calling YouTube Search API...`);
    const searchResp = await fetch(searchUrl);
    
    if (!searchResp.ok) {
      const errorText = await searchResp.text().catch(() => searchResp.statusText);
      let errorJson: any = null;
      try {
        errorJson = JSON.parse(errorText);
      } catch {
        // Not JSON, ignore
      }
      console.error(`[searchYouTube] YouTube Search API error: ${searchResp.status}`, errorText);
      
      // Provide helpful error messages
      if (errorJson?.error?.message) {
        throw new Error(`YouTube API Error: ${errorJson.error.message} (Code: ${errorJson.error.code})`);
      }
      throw new Error(`YouTube Search API error: ${searchResp.status} ${errorText}`);
    }

    const searchData = await searchResp.json();
    console.log(`[searchYouTube] Search returned ${searchData.items?.length ?? 0} items`);
    
    if (!searchData.items || searchData.items.length === 0) {
      console.warn(`[searchYouTube] No search results found for query: "${query}"`);
      return [];
    }

    // Extract video IDs to get duration and full details
    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
    console.log(`[searchYouTube] Fetching details for ${videoIds.split(',').length} videos...`);
    
    // Get video details including duration
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${encodeURIComponent(apiKey)}`;
    const detailsResp = await fetch(detailsUrl);
    
    if (!detailsResp.ok) {
      const errorText = await detailsResp.text().catch(() => detailsResp.statusText);
      console.warn(`[searchYouTube] Details fetch failed (${detailsResp.status}), using basic info:`, errorText);
      // If details fetch fails, return basic info without duration
      const basicVideos = searchData.items.map((item: any) => ({
        youtube_id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
      }));
      console.log(`[searchYouTube] Returning ${basicVideos.length} videos without duration`);
      return basicVideos;
    }

    const detailsData = await detailsResp.json();
    console.log(`[searchYouTube] Details fetched for ${detailsData.items?.length ?? 0} videos`);
    
    // Parse ISO 8601 duration (e.g., PT4M13S = 4 minutes 13 seconds)
    function parseDuration(isoDuration: string): number {
      const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const hours = parseInt(match[1] || '0', 10);
      const minutes = parseInt(match[2] || '0', 10);
      const seconds = parseInt(match[3] || '0', 10);
      return hours * 3600 + minutes * 60 + seconds;
    }

    // Map search results with details
    const videos: YouTubeVideo[] = detailsData.items.map((item: any) => ({
      youtube_id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
      duration: parseDuration(item.contentDetails.duration || 'PT0S'),
    }));

    console.log(`[searchYouTube] Successfully processed ${videos.length} videos`);
    return videos;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[searchYouTube] Error for query "${query}":`, msg);
    throw e;
  }
}

/**
 * Use Gemini to rerank YouTube videos based on topic relevance
 * Returns top 3 most relevant videos
 */
async function rerankVideosWithGemini(
  geminiKey: string,
  model: string,
  topicTitle: string,
  topicSubpoints: string[],
  videos: YouTubeVideo[]
): Promise<YouTubeVideo[]> {
  if (videos.length === 0) return [];
  if (!geminiKey) {
    // If no Gemini key, return first 3 videos
    return videos.slice(0, 3);
  }

  try {
    // Prepare video summaries for Gemini
    const videoSummaries = videos.map((v, idx) => ({
      index: idx,
      title: v.title,
      description: truncate(v.description || '', 200),
    }));

    const prompt = `You are ranking YouTube videos for educational relevance to a specific topic.

Topic: ${topicTitle}
Key Points:
${topicSubpoints.map(p => `- ${p}`).join('\n')}

Videos to rank:
${videoSummaries.map(v => `${v.index}. ${v.title}\n   ${v.description}`).join('\n\n')}

Return a JSON array of the indices (0-based) of the top 3 most relevant videos, ordered from most to least relevant. Format: {"ranked": [index1, index2, index3]}

Only return the JSON, no other text.`;

    const data = await geminiCall(geminiKey, model, [{ text: prompt }], { maxOutputTokens: 256 });
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = parseJsonish(raw);

    if (parsed && Array.isArray((parsed as any).ranked)) {
      const rankedIndices = (parsed as any).ranked.slice(0, 3).filter((idx: number) => idx >= 0 && idx < videos.length);
      return rankedIndices.map((idx: number) => videos[idx]).filter(Boolean);
    }

    // Fallback: return first 3 videos if parsing fails
    console.warn("Gemini reranking failed to parse, using first 3 videos");
    return videos.slice(0, 3);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Gemini reranking error:`, msg);
    // Fallback: return first 3 videos on error
    return videos.slice(0, 3);
  }
}

/**
 * Process multiple PDFs in a single Gemini API call to save quota
 * Returns an array of topics, one for each PDF
 */
async function summarizeMultiplePdfsWithGemini(
  key: string, 
  model: string, 
  pdfData: Array<{ bytes: Uint8Array; filePath?: string; slideId: string }>
): Promise<Array<{ slideId: string; title: string; subpoints: string[]; raw: string }>> {
  console.log(`[summarizeMultiplePdfsWithGemini] Processing ${pdfData.length} PDFs in single API call`);
  
  // Build parts array with instruction and all PDFs
  const parts: any[] = [{
    text: `You are analyzing ${pdfData.length} study slides. For each slide, extract a concise topic title and 3-7 bullet subpoints. Return a JSON array where each element has the structure: {"slideIndex": number (0-based), "title": string, "subpoints": string[]}. Return ONLY the JSON array, no markdown, no code blocks. Example format: [{"slideIndex": 0, "title": "...", "subpoints": [...]}, {"slideIndex": 1, ...}]`
  }];
  
  // Add all PDFs to the parts array
  for (let i = 0; i < pdfData.length; i++) {
    const item = pdfData[i];
    const isPdf = !item.filePath || item.filePath.toLowerCase().endsWith('.pdf');
    const mimeType = isPdf ? "application/pdf" : "image/png";
    const b64 = encodeBase64(item.bytes);
    
    parts.push({
      text: `--- Slide ${i + 1} (Index: ${i}) ---`
    });
    parts.push({
      inlineData: { mimeType, data: b64 }
    });
  }
  
  try {
    // Increase max tokens for batch processing to handle larger responses
    const data = await geminiCall(key, model, parts, { maxOutputTokens: 8192 });
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    console.log(`[summarizeMultiplePdfsWithGemini] Raw response length: ${raw.length}`);
    
    // Parse the JSON array response with multiple fallback strategies
    let parsed: any = null;
    
    // Strategy 1: Direct parse after cleaning
    try {
      let cleaned = raw.trim();
      // Remove markdown code blocks
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      // Remove any leading/trailing whitespace or text
      cleaned = cleaned.replace(/^[^{[]*/, '').replace(/[^}\]]*$/, '');
      
      parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        console.log(`[summarizeMultiplePdfsWithGemini] Successfully parsed JSON array directly`);
      }
    } catch (e1) {
      console.log(`[summarizeMultiplePdfsWithGemini] Direct parse failed, trying extraction: ${e1 instanceof Error ? e1.message : String(e1)}`);
      
      // Strategy 2: Extract JSON array by finding matching brackets (handles strings correctly)
      try {
        let cleaned = raw.trim();
        cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        
        // Find the first [ and try to find matching ]
        const arrayStart = cleaned.indexOf("[");
        if (arrayStart < 0) {
          throw new Error("No array start bracket found");
        }
        
        // Find matching closing bracket by counting nested brackets and handling strings
        let bracketCount = 0;
        let inString = false;
        let escapeNext = false;
        let arrayEnd = -1;
        
        for (let i = arrayStart; i < cleaned.length; i++) {
          const char = cleaned[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\') {
            escapeNext = true;
            continue;
          }
          
          if (char === '"') {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '[') bracketCount++;
            if (char === ']') {
              bracketCount--;
              if (bracketCount === 0) {
                arrayEnd = i;
                break;
              }
            }
          }
        }
        
        if (arrayEnd > arrayStart) {
          const arrayStr = cleaned.slice(arrayStart, arrayEnd + 1);
          parsed = JSON.parse(arrayStr);
          if (Array.isArray(parsed)) {
            console.log(`[summarizeMultiplePdfsWithGemini] Successfully parsed extracted JSON array`);
          }
        } else {
          throw new Error("Could not find matching closing bracket");
        }
      } catch (e2) {
        console.log(`[summarizeMultiplePdfsWithGemini] Array extraction failed, trying repair: ${e2 instanceof Error ? e2.message : String(e2)}`);
        
        // Strategy 3: Try to repair common JSON issues
        try {
          let cleaned = raw.trim();
          cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
          
          // Find array start
          const arrayStart = cleaned.indexOf("[");
          if (arrayStart < 0) {
            throw new Error("No array start found");
          }
          
          // Try to find matching closing bracket, counting nested brackets
          let bracketCount = 0;
          let inString = false;
          let escapeNext = false;
          let arrayEnd = -1;
          
          for (let i = arrayStart; i < cleaned.length; i++) {
            const char = cleaned[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"') {
              inString = !inString;
              continue;
            }
            
            if (!inString) {
              if (char === '[') bracketCount++;
              if (char === ']') {
                bracketCount--;
                if (bracketCount === 0) {
                  arrayEnd = i;
                  break;
                }
              }
            }
          }
          
          if (arrayEnd > arrayStart) {
            const arrayStr = cleaned.slice(arrayStart, arrayEnd + 1);
            parsed = JSON.parse(arrayStr);
            if (Array.isArray(parsed)) {
              console.log(`[summarizeMultiplePdfsWithGemini] Successfully parsed repaired JSON array`);
            }
          } else {
            throw new Error("Could not find matching closing bracket");
          }
        } catch (e3) {
          // Strategy 4: Try to parse individual objects and build array
          console.log(`[summarizeMultiplePdfsWithGemini] Repair failed, trying individual object parsing: ${e3 instanceof Error ? e3.message : String(e3)}`);
          
          try {
            let cleaned = raw.trim();
            cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
            
            // Try to extract individual JSON objects
            const objects: any[] = [];
            let start = 0;
            
            while (start < cleaned.length) {
              const objStart = cleaned.indexOf("{", start);
              if (objStart < 0) break;
              
              // Find matching closing brace
              let braceCount = 0;
              let inString = false;
              let escapeNext = false;
              let objEnd = -1;
              
              for (let i = objStart; i < cleaned.length; i++) {
                const char = cleaned[i];
                
                if (escapeNext) {
                  escapeNext = false;
                  continue;
                }
                
                if (char === '\\') {
                  escapeNext = true;
                  continue;
                }
                
                if (char === '"') {
                  inString = !inString;
                  continue;
                }
                
                if (!inString) {
                  if (char === '{') braceCount++;
                  if (char === '}') {
                    braceCount--;
                    if (braceCount === 0) {
                      objEnd = i;
                      break;
                    }
                  }
                }
              }
              
              if (objEnd > objStart) {
                try {
                  const objStr = cleaned.slice(objStart, objEnd + 1);
                  const obj = JSON.parse(objStr);
                  objects.push(obj);
                  start = objEnd + 1;
                } catch {
                  start = objStart + 1;
                }
              } else {
                break;
              }
            }
            
            if (objects.length > 0) {
              parsed = objects;
              console.log(`[summarizeMultiplePdfsWithGemini] Successfully parsed ${objects.length} individual objects`);
            } else {
              throw new Error("No valid JSON objects found");
            }
          } catch (e4) {
            console.error(`[summarizeMultiplePdfsWithGemini] All parsing strategies failed`);
            console.error(`[summarizeMultiplePdfsWithGemini] Response preview: ${raw.substring(0, 500)}`);
            throw new Error(`Failed to parse batch response after all attempts: ${e4 instanceof Error ? e4.message : String(e4)}`);
          }
        }
      }
    }
    
    let results: Array<{ slideId: string; title: string; subpoints: string[]; raw: string }> = [];
    
    if (Array.isArray(parsed)) {
      // Map results back to slide IDs
      for (const item of parsed) {
        if (typeof item.slideIndex === 'number' && item.slideIndex >= 0 && item.slideIndex < pdfData.length) {
          const slideId = pdfData[item.slideIndex].slideId;
          const title = String(item.title || `Topic ${item.slideIndex + 1}`);
          const subpoints = Array.isArray(item.subpoints) 
            ? item.subpoints.map((s: unknown) => String(s)).filter(Boolean)
            : [];
          
          if (title && subpoints.length > 0) {
            results.push({ slideId, title, subpoints, raw: JSON.stringify(item) });
          }
        }
      }
    }
    
    // Ensure we have results for all slides (fill in missing ones)
    for (let i = 0; i < pdfData.length; i++) {
      const existing = results.find(r => r.slideId === pdfData[i].slideId);
      if (!existing) {
        console.warn(`[summarizeMultiplePdfsWithGemini] No result for slide ${i}, creating fallback`);
        results.push({
          slideId: pdfData[i].slideId,
          title: pdfData[i].filePath?.split('/').pop()?.replace(/\.(pdf|ppt|pptx)$/i, '') || `Topic ${i + 1}`,
          subpoints: ["Content extracted", "Review this slide"],
          raw: ""
        });
      }
    }
    
    console.log(`[summarizeMultiplePdfsWithGemini] Successfully extracted ${results.length} topics`);
    return results;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[summarizeMultiplePdfsWithGemini] Batch processing failed:`, errorMsg);
    throw error;
  }
}

async function summarizePdfWithGemini(key: string, model: string, pdfBytes: Uint8Array, filePath?: string): Promise<{ title: string; subpoints: string[]; raw: string }> {
  console.log(`[summarizePdfWithGemini] Starting, file size: ${pdfBytes.length} bytes, filePath: ${filePath || 'unknown'}`);
  
  // Detect file type from extension or try PDF first (Gemini supports PDF, images, but not PPT/PPTX directly)
  const isPdf = !filePath || filePath.toLowerCase().endsWith('.pdf');
  const mimeType = isPdf ? "application/pdf" : "image/png"; // Fallback to image for PPT files (they might have been converted)
  
  const b64 = encodeBase64(pdfBytes);
  console.log(`[summarizePdfWithGemini] Base64 encoded, size: ${b64.length} chars, mimeType: ${mimeType}`);
  
  const baseParts = [{ 
    text: "You are summarizing a single slide of study material into a concise topic with 3-7 bullet subpoints. Return STRICT JSON: {\"title\": string, \"subpoints\": string[]} only. Do not include any markdown formatting or code blocks, just the raw JSON." 
  }, { 
    inlineData: { mimeType, data: b64 } 
  }];

  // First attempt - use higher token limit to avoid truncation
  let data;
  let raw = "";
  let parsed: { title?: string; subpoints?: string[] } | null = null;
  
  try {
    data = await geminiCall(key, model, baseParts, { maxOutputTokens: 2048, responseMimeType: "application/json" });
    console.log(`[summarizePdfWithGemini] First Gemini call completed`);
    
    // Try multiple ways to extract the response
    raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    
    // Also check if response is in finishReason
    if (!raw && data?.candidates?.[0]?.finishReason) {
      console.warn(`[summarizePdfWithGemini] Finish reason: ${data.candidates[0].finishReason}`);
    }
    
    // Check for blocked content
    if (data?.candidates?.[0]?.finishReason === 'SAFETY') {
      throw new Error('Content was blocked by safety filters');
    }
    
    console.log(`[summarizePdfWithGemini] Raw response length: ${raw.length}, preview: ${raw.substring(0, 200)}`);
    
    parsed = parseJsonish(raw);
    console.log(`[summarizePdfWithGemini] Parsed result:`, { hasTitle: !!parsed?.title, subpointsCount: parsed?.subpoints?.length ?? 0 });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[summarizePdfWithGemini] First attempt failed:`, errorMsg);
    throw error;
  }

  let title = String(parsed?.title ?? "Summary");
  let subpoints = Array.isArray(parsed?.subpoints) ? parsed!.subpoints.map((s: unknown) => String(s)).filter(Boolean) : [];

  // Fallback prompt if empty
  if (subpoints.length === 0 || !parsed?.title) {
    console.log(`[summarizePdfWithGemini] First attempt produced empty results, trying fallback`);
    try {
      const fallbackParts = [{ 
        text: "Return JSON with keys 'title' and 'subpoints'. Title should be a concise topic name. Subpoints should be an array of 3-7 strings. Ensure subpoints has at least 3 concise bullets extracted or inferred from the slide. If slide is images only, infer key talking points. Return ONLY valid JSON, no markdown, no code blocks." 
      }, { 
        inlineData: { mimeType, data: b64 } 
      }];
      data = await geminiCall(key, model, fallbackParts, { maxOutputTokens: 2048, responseMimeType: "application/json" });
      raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? raw;
      parsed = parseJsonish(raw) ?? parsed;
      title = String(parsed?.title ?? (title || "Untitled Topic"));
      subpoints = Array.isArray(parsed?.subpoints) ? parsed!.subpoints.map((s: unknown) => String(s)).filter(Boolean) : subpoints;
      console.log(`[summarizePdfWithGemini] Fallback result:`, { title, subpointsCount: subpoints.length });
    } catch (fallbackError) {
      const errorMsg = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      console.error(`[summarizePdfWithGemini] Fallback also failed:`, errorMsg);
      // If both fail, throw with detailed error
      throw new Error(`Gemini extraction failed: ${errorMsg}. Raw response: ${raw.substring(0, 500)}`);
    }
  }

  // Final validation
  if (subpoints.length === 0) {
    throw new Error(`No subpoints extracted. Raw response: ${raw.substring(0, 500)}`);
  }

  console.log(`[summarizePdfWithGemini] Successfully extracted: "${title}" with ${subpoints.length} subpoints`);
  return { title, subpoints, raw };
}

async function bytesFromSignedUrl(signedUrl: string): Promise<Uint8Array> {
  const r = await fetch(signedUrl);
  if (!r.ok) throw new Error(`Fetch slide failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function processSlide({ supabase, slide, apiKey, youtubeApiKey, model, examId }: { supabase: any; slide: any; apiKey: string; youtubeApiKey: string; model: string; examId: string }): Promise<SlideResult> {
  const t0 = Date.now();
  try {
    console.log(`[processSlide] Starting processing for slide ${slide.id}, file: ${slide.file_url}`);
    
    // Check if topic already exists for this slide (to avoid duplicates)
    const { data: existingTopic } = await supabase
      .from("topics")
      .select("id")
      .eq("slide_id", slide.id)
      .maybeSingle();
    
    if (existingTopic) {
      console.log(`[processSlide] Topic already exists for slide ${slide.id}, skipping`);
      await supabase.from("slides").update({ ai_summary_json: { status: "done" } }).eq("id", slide.id);
      return { id: slide.id, ok: true, ms: Date.now() - t0, skipped: true };
    }

    // Get signed URL for the slide file
    const { data: signed, error: signedErr } = await supabase.storage.from("slides").createSignedUrl(slide.file_url, 60 * 5);
    if (signedErr) throw signedErr;
    
    // Download and process the slide
    console.log(`[processSlide] Downloading slide file for ${slide.id}, path: ${slide.file_url}`);
    const bytes = await bytesFromSignedUrl(signed.signedUrl);
    console.log(`[processSlide] Downloaded ${bytes.length} bytes`);
    
    // Extract topic and subpoints using Gemini
    console.log(`[processSlide] Extracting topic with Gemini for ${slide.id}`);
    const summaryResult = await summarizePdfWithGemini(apiKey, model, bytes, slide.file_url);
    const title = (summaryResult.title || (slide.file_url?.split("/").pop() || "Slide")).slice(0, 200);
    const subpoints = (summaryResult.subpoints || []).slice(0, 12);

    if (subpoints.length === 0) {
      throw new Error(`Empty subpoints from Gemini | raw=${truncate(summaryResult.raw, 200)}`);
    }

    console.log(`[processSlide] Extracted topic: "${title}" with ${subpoints.length} subpoints`);

    // Insert Topic
    const { data: topic, error: insertErr } = await supabase.from("topics").insert({
      slide_id: slide.id,
      title,
      subpoints_json: subpoints
    }).select('id').single();

    if (insertErr) throw insertErr;
    console.log(`[processSlide] Topic created: ${topic.id}`);

    // Generate one video per subpoint to ensure all bullet points are covered
    // Track used videos to avoid duplicates - if same video is found, reuse it for multiple subpoints
    if (youtubeApiKey && subpoints.length > 0) {
      console.log(`[processSlide] Generating videos for ${subpoints.length} subpoints`);
      const videoInserts: any[] = [];
      const usedVideoIds = new Set<string>(); // Track which youtube_ids we've already used
      const videoToSubpointIndices = new Map<string, number[]>(); // Map video_id to array of subpoint indices
      
      for (let subpointIdx = 0; subpointIdx < subpoints.length; subpointIdx++) {
        const subpoint = subpoints[subpointIdx];
        
        // Create search query using topic title + specific subpoint
        const rawQuery = `${title} ${subpoint} tutorial explanation`.trim();
        const searchQuery = rawQuery.length > 100 ? rawQuery.substring(0, 100) : rawQuery;
        console.log(`[processSlide] Searching YouTube for subpoint ${subpointIdx + 1}: "${searchQuery}"`);
        
        try {
          // Search for videos relevant to this specific subpoint
          const videos = await searchYouTube(youtubeApiKey, searchQuery);
          
          if (videos.length > 0) {
            // Use reranking if available, otherwise take first video
            let selectedVideo: YouTubeVideo;
            const skipReranking = Deno.env.get("SKIP_VIDEO_RERANKING") === "true";
            
            if (skipReranking || videos.length === 1) {
              selectedVideo = videos[0];
            } else {
              try {
                // Rerank to find best video for this subpoint
                const reranked = await rerankVideosWithGemini(apiKey, model, title, [subpoint], videos);
                selectedVideo = reranked[0] || videos[0];
              } catch (rerankError) {
                // Fallback to first video if reranking fails
                selectedVideo = videos[0];
                console.warn(`[processSlide] Reranking failed for subpoint ${subpointIdx + 1}, using first video`);
              }
            }
            
            // Skip videos we've already used, try to find a different one
            let finalVideo = selectedVideo;
            let isDuplicate = false;
            
            if (usedVideoIds.has(selectedVideo.youtube_id)) {
              // Try to find a different video from search results (skip first few that are likely duplicates)
              const alternativeVideo = videos.find((v, idx) => idx > 0 && !usedVideoIds.has(v.youtube_id));
              if (alternativeVideo) {
                finalVideo = alternativeVideo;
                console.log(`[processSlide] Subpoint ${subpointIdx + 1}: Duplicate video detected, using alternative: ${finalVideo.title}`);
              } else {
                // All videos in search are duplicates, reuse the existing one
                isDuplicate = true;
                console.log(`[processSlide] Subpoint ${subpointIdx + 1}: All videos are duplicates, reusing: ${finalVideo.title} (will create separate entry for UI)`);
              }
            }
            
            // Mark this video as used (even if duplicate, we track it)
            usedVideoIds.add(finalVideo.youtube_id);
            
            // Track which subpoints this video covers
            const subpointIndices = videoToSubpointIndices.get(finalVideo.youtube_id) || [];
            subpointIndices.push(subpointIdx);
            videoToSubpointIndices.set(finalVideo.youtube_id, subpointIndices);
            
            // Create video entry for this subpoint
            // Even if duplicate, create separate entry so each subpoint has a video association
            // Frontend will group by youtube_id to show shared videos
            const insert: any = {
              topic_id: topic.id,
              youtube_id: finalVideo.youtube_id,
              title: finalVideo.title,
              description: truncate(finalVideo.description || '', 500),
              thumbnail_url: finalVideo.thumbnail_url,
              subpoint_index: subpointIdx, // Each subpoint gets its own entry with correct index
            };
            
            if (finalVideo.duration) {
              insert.duration = finalVideo.duration;
            }
            
            videoInserts.push(insert);
            if (isDuplicate) {
              console.log(`[processSlide] Video for subpoint ${subpointIdx + 1}: ${finalVideo.title} (duplicate - will be grouped in UI with other subpoints)`);
            } else {
              console.log(`[processSlide] Video for subpoint ${subpointIdx + 1}: ${finalVideo.title}`);
            }
          } else {
            console.warn(`[processSlide] No videos found for subpoint ${subpointIdx + 1}`);
          }
        } catch (subpointError) {
          const errorMsg = subpointError instanceof Error ? subpointError.message : String(subpointError);
          console.error(`[processSlide] Failed to get video for subpoint ${subpointIdx + 1}:`, errorMsg);
          // Continue with other subpoints even if one fails
        }
        
        // Add small delay between searches to respect rate limits
        if (subpointIdx < subpoints.length - 1) {
          await delay(500);
        }
      }
      
      console.log(`[processSlide] Generated ${videoInserts.length} unique videos for ${subpoints.length} subpoints`);
      
      // Insert all videos at once
      if (videoInserts.length > 0) {
        console.log(`[processSlide] Inserting ${videoInserts.length} videos (one per subpoint) into database...`);
        let { data: insertedVideos, error: videoInsertErr } = await supabase
          .from("videos")
          .insert(videoInserts)
          .select();
          
        // If insert fails due to missing duration or subpoint_index column, retry without them
        if (videoInsertErr && (videoInsertErr.message?.includes("duration") || videoInsertErr.message?.includes("subpoint_index"))) {
          console.warn(`[processSlide] Insert failed, retrying without optional fields`);
          const videoInsertsRetry = videoInserts.map(({ duration, subpoint_index, ...rest }) => {
            const retryInsert: any = rest;
            if (duration) retryInsert.duration = duration;
            if (subpoint_index !== undefined) retryInsert.subpoint_index = subpoint_index;
            return retryInsert;
          });
          const retryResult = await supabase
            .from("videos")
            .insert(videoInsertsRetry)
            .select();
          insertedVideos = retryResult.data;
          videoInsertErr = retryResult.error;
        }
          
        if (videoInsertErr) {
          console.error(`[processSlide] Failed to insert videos:`, videoInsertErr);
          console.error(`[processSlide] Error details:`, JSON.stringify(videoInsertErr, null, 2));
          // Don't fail the whole operation if video insert fails
        } else {
          console.log(`[processSlide] Successfully inserted ${insertedVideos?.length ?? videoInserts.length} videos for ${subpoints.length} subpoints`);
          if (insertedVideos && insertedVideos.length > 0) {
            console.log(`[processSlide] Inserted video IDs:`, insertedVideos.map((v: any) => v.id));
          }
        }
      } else {
        console.warn(`[processSlide] No videos were found for any subpoints`);
      }
    } else if (!youtubeApiKey) {
      console.warn(`[processSlide] YOUTUBE_API_KEY not provided, skipping video search`);
    }

    // Update slide status to done
    await supabase.from("slides").update({ ai_summary_json: { status: "done" } }).eq("id", slide.id);
    console.log(`[processSlide] Completed processing slide ${slide.id} in ${Date.now() - t0}ms`);
    return { id: slide.id, ok: true, ms: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[processSlide] Error processing slide ${slide.id}:`, msg);
    await supabase.from("slides").update({ ai_summary_json: { status: "error", error: msg } }).eq("id", slide.id);
    return { id: slide.id, ok: false, ms: Date.now() - t0, err: msg, rawSnippet: msg.includes("raw=") ? msg.split("raw=")[1] : undefined };
  }
}

function pool<T>(items: T[], size: number): T[][] {
  const buckets: T[][] = Array.from({ length: size }, () => []);
  items.forEach((it, i) => buckets[i % size].push(it));
  return buckets;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY") || "";
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash-latest";
  const authHeader = req.headers.get("Authorization");

  console.log(`[process-exam] Environment check:`, {
    hasSupabaseUrl: !!supabaseUrl,
    hasSupabaseAnonKey: !!supabaseAnonKey,
    hasGeminiKey: !!apiKey,
    geminiKeyLength: apiKey.length,
    geminiKeyPreview: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : "NOT SET",
    hasYoutubeKey: !!youtubeApiKey,
    youtubeKeyLength: youtubeApiKey.length,
    youtubeKeyPreview: youtubeApiKey ? `${youtubeApiKey.substring(0, 10)}...${youtubeApiKey.substring(youtubeApiKey.length - 4)}` : "NOT SET",
    model,
  });

  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Server env not configured" }, 500);
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  
  // Validate Gemini API key
  if (!apiKey || apiKey.trim().length === 0) {
    console.error(`[process-exam] GEMINI_API_KEY is empty or not set`);
    return json({ error: "GEMINI_API_KEY not set on Edge Function. Please add it in Supabase Dashboard → Edge Functions → process-exam → Settings → Secrets" }, 400);
  }
  
  // Check if API key looks valid (should start with AIza)
  if (!apiKey.startsWith("AIza")) {
    console.warn(`[process-exam] GEMINI_API_KEY doesn't start with 'AIza' - might be invalid format`);
  }

  // YouTube API key is optional - we'll continue without videos if not provided
  if (!youtubeApiKey) {
    console.warn("[process-exam] YOUTUBE_API_KEY not set - videos will not be fetched");
  } else {
    console.log("[process-exam] YOUTUBE_API_KEY is set - video search and reranking enabled");
  }

  try {
    const { examId } = await req.json().catch(() => ({ examId: null })) as { examId: string | null };
    if (!examId) return json({ error: "Missing examId" }, 400);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: slides, error: slidesErr } = await supabase
      .from("slides")
      .select("id, file_url")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });
    
    if (slidesErr) return json({ error: slidesErr.message }, 400);

    if (!slides || slides.length === 0) {
      return json({ topicsInserted: 0, diagnostics: { hasKey: true, model, slideCount: 0, results: [] } });
    }

    console.log(`[process-exam] Processing ${slides.length} slides for exam ${examId}`);
    await supabase.from("slides").update({ ai_summary_json: { status: "processing" } }).in("id", slides.map((s: any) => s.id));

    // Check if batch processing is enabled (default: true - processes multiple PDFs in one API call)
    const useBatchProcessing = Deno.env.get("USE_BATCH_PROCESSING") !== "false";
    const batchSize = Number(Deno.env.get("BATCH_SIZE") || "5"); // Process 5 slides per API call
    const skipReranking = Deno.env.get("SKIP_VIDEO_RERANKING") === "true";
    
    const results: SlideResult[] = [];
    
    // Reset rate limiter at start
    lastGeminiCallTime = 0;
    
    if (useBatchProcessing && slides.length > 1) {
      // Batch processing mode: process multiple slides in one API call to save quota
      console.log(`[process-exam] Using BATCH processing mode: ${batchSize} slides per API call`);
      
      // Filter out slides that already have topics
      const slidesToProcess: any[] = [];
      for (const slide of slides) {
        const { data: existingTopic } = await supabase
          .from("topics")
          .select("id")
          .eq("slide_id", slide.id)
          .maybeSingle();
        
        if (existingTopic) {
          console.log(`[process-exam] Slide ${slide.id} already has topic, skipping`);
          await supabase.from("slides").update({ ai_summary_json: { status: "done" } }).eq("id", slide.id);
          results.push({ id: slide.id, ok: true, ms: 0, skipped: true });
        } else {
          slidesToProcess.push(slide);
        }
      }
      
      // Process slides in batches
      for (let i = 0; i < slidesToProcess.length; i += batchSize) {
        const batch = slidesToProcess.slice(i, i + batchSize);
        console.log(`[process-exam] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(slidesToProcess.length / batchSize)}: ${batch.length} slides`);
        
        try {
          // Download all PDFs in batch
          const pdfData = await Promise.all(
            batch.map(async (slide) => {
              const { data: signed, error: signedErr } = await supabase.storage
                .from("slides")
                .createSignedUrl(slide.file_url, 60 * 5);
              if (signedErr) throw signedErr;
              
              const bytes = await bytesFromSignedUrl(signed.signedUrl);
              return { bytes, filePath: slide.file_url, slideId: slide.id };
            })
          );
          
          // Process all PDFs in ONE API call
          const topics = await summarizeMultiplePdfsWithGemini(apiKey, model, pdfData);
          
          // Insert topics and videos for each slide
          for (const topicData of topics) {
            const slide = batch.find(s => s.id === topicData.slideId);
            if (!slide) continue;
            
            try {
              // Insert topic
              const { data: topic, error: insertErr } = await supabase
                .from("topics")
                .insert({
                  slide_id: slide.id,
                  title: topicData.title,
                  subpoints_json: topicData.subpoints,
                })
                .select('id')
                .single();
              
              if (insertErr) throw insertErr;
              
              // Generate one video per subpoint
              if (youtubeApiKey && topicData.subpoints.length > 0) {
                console.log(`[process-exam] Generating videos for ${topicData.subpoints.length} subpoints`);
                const videoInserts: any[] = [];
                
                for (let subpointIdx = 0; subpointIdx < topicData.subpoints.length; subpointIdx++) {
                  const subpoint = topicData.subpoints[subpointIdx];
                  const searchQuery = `${topicData.title} ${subpoint} tutorial explanation`.trim().substring(0, 100);
                  
                  try {
                    const videos = await searchYouTube(youtubeApiKey, searchQuery);
                    if (videos.length > 0) {
                      // Take first video for this subpoint (skip reranking to save API calls in batch mode)
                      const selectedVideo = videos[0];
                      const insert: any = {
                        topic_id: topic.id,
                        youtube_id: selectedVideo.youtube_id,
                        title: selectedVideo.title,
                        description: truncate(selectedVideo.description || '', 500),
                        thumbnail_url: selectedVideo.thumbnail_url,
                        subpoint_index: subpointIdx,
                      };
                      if (selectedVideo.duration) {
                        insert.duration = selectedVideo.duration;
                      }
                      videoInserts.push(insert);
                    }
                    
                    // Small delay between searches
                    if (subpointIdx < topicData.subpoints.length - 1) {
                      await delay(500);
                    }
                  } catch (videoErr) {
                    console.warn(`[process-exam] Video search failed for subpoint ${subpointIdx}:`, videoErr);
                    // Continue with other subpoints
                  }
                }
                
                if (videoInserts.length > 0) {
                  try {
                    await supabase.from("videos").insert(videoInserts);
                    console.log(`[process-exam] Inserted ${videoInserts.length} videos for topic`);
                  } catch (insertErr) {
                    console.warn(`[process-exam] Failed to insert videos:`, insertErr);
                  }
                }
              }
              
              await supabase.from("slides").update({ ai_summary_json: { status: "done" } }).eq("id", slide.id);
              results.push({ id: slide.id, ok: true, ms: 0 });
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`[process-exam] Error processing slide ${topicData.slideId}:`, msg);
              await supabase.from("slides").update({ ai_summary_json: { status: "error", error: msg } }).eq("id", slide.id);
              results.push({ id: topicData.slideId, ok: false, ms: 0, err: msg });
            }
          }
        } catch (batchError) {
          const msg = batchError instanceof Error ? batchError.message : String(batchError);
          console.error(`[process-exam] Batch processing failed:`, msg);
          // Mark all slides in batch as failed
          for (const slide of batch) {
            await supabase.from("slides").update({ ai_summary_json: { status: "error", error: msg } }).eq("id", slide.id);
            results.push({ id: slide.id, ok: false, ms: 0, err: msg });
          }
        }
        
        // Add delay between batches
        if (i + batchSize < slidesToProcess.length) {
          await delay(1000);
        }
      }
    } else {
      // Individual processing mode (fallback or when batch processing is disabled)
      console.log(`[process-exam] Using INDIVIDUAL processing mode`);
      const concurrency = Number(Deno.env.get("CONCURRENCY") || 1);
      const groups = pool(slides, Math.max(1, concurrency));
      
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        console.log(`[process-exam] Processing batch ${i + 1}/${groups.length} with ${group.length} slide(s)`);
        
        if (concurrency === 1) {
          for (const slide of group) {
            const result = await processSlide({ supabase, slide, apiKey, youtubeApiKey, model, examId });
            results.push(result);
          }
        } else {
          const batch = await Promise.all(
            group.map((s) => processSlide({ supabase, slide: s, apiKey, youtubeApiKey, model, examId }))
          );
          results.push(...batch);
        }
        
        if (i < groups.length - 1) {
          await delay(1000);
        }
      }
    }

    const topicsInserted = results.filter(r => r.ok && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.ok).length;
    
    console.log(`[process-exam] Processing complete: ${topicsInserted} topics inserted, ${skipped} skipped (already exist), ${failed} failed`);
    
    return json({
      topicsInserted,
      skipped,
      failed,
      diagnostics: {
        hasKey: !!apiKey,
        hasYoutubeKey: !!youtubeApiKey,
        model,
        slideCount: slides.length,
        results,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
