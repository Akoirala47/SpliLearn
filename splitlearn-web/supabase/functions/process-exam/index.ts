import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

type SlideResult = { id: string; ok: boolean; ms: number; err?: string; rawSnippet?: string };

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

async function geminiCall(key: string, model: string, parts: any[], config?: { maxOutputTokens?: number; responseMimeType?: string }): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: config?.maxOutputTokens ?? 768,
      responseMimeType: config?.responseMimeType ?? "application/json",
    },
  };
  
  console.log(`[geminiCall] Calling Gemini API with model: ${model}, parts: ${parts.length}`);
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  
  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => resp.statusText);
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

  // First attempt
  let data;
  let raw = "";
  let parsed: { title?: string; subpoints?: string[] } | null = null;
  
  try {
    data = await geminiCall(key, model, baseParts);
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
      data = await geminiCall(key, model, fallbackParts);
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

async function processSlide({ supabase, slide, apiKey, youtubeApiKey, model }: { supabase: any; slide: any; apiKey: string; youtubeApiKey: string; model: string }): Promise<SlideResult> {
  const t0 = Date.now();
  try {
    console.log(`[processSlide] Starting processing for slide ${slide.id}`);
    
    // Check if topic already exists for this slide (to avoid duplicates)
    const { data: existingTopic } = await supabase
      .from("topics")
      .select("id")
      .eq("slide_id", slide.id)
      .maybeSingle();
    
    if (existingTopic) {
      console.log(`[processSlide] Topic already exists for slide ${slide.id}, skipping`);
      await supabase.from("slides").update({ ai_summary_json: { status: "done" } }).eq("id", slide.id);
      return { id: slide.id, ok: true, ms: Date.now() - t0 };
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

    // Generate search query for YouTube videos
    // Use topic title + first subpoint for better relevance
    // Truncate to reasonable length (YouTube API has limits)
    const rawQuery = `${title} ${subpoints[0] || ''} tutorial explanation`.trim();
    const searchQuery = rawQuery.length > 100 ? rawQuery.substring(0, 100) : rawQuery;
    console.log(`[processSlide] Searching YouTube for: "${searchQuery}"`);

    // Search YouTube for relevant videos
    let videos: YouTubeVideo[] = [];
    if (youtubeApiKey) {
      try {
        videos = await searchYouTube(youtubeApiKey, searchQuery);
        console.log(`[processSlide] Found ${videos.length} YouTube videos`);
      } catch (youtubeError) {
        const errorMsg = youtubeError instanceof Error ? youtubeError.message : String(youtubeError);
        console.error(`[processSlide] YouTube search failed for "${searchQuery}":`, errorMsg);
        // Continue without videos if search fails
      }
    } else {
      console.warn(`[processSlide] YOUTUBE_API_KEY not provided, skipping video search`);
    }

    // Rerank videos using Gemini to get top 3 most relevant
    let topVideos: YouTubeVideo[] = [];
    if (videos.length > 0) {
      try {
        console.log(`[processSlide] Reranking ${videos.length} videos with Gemini`);
        topVideos = await rerankVideosWithGemini(apiKey, model, title, subpoints, videos);
        console.log(`[processSlide] Selected top ${topVideos.length} videos after reranking`);
      } catch (rerankError) {
        const errorMsg = rerankError instanceof Error ? rerankError.message : String(rerankError);
        console.warn(`[processSlide] Video reranking failed:`, errorMsg);
        // Fallback to first 3 videos if reranking fails
        topVideos = videos.slice(0, 3);
        console.log(`[processSlide] Using first ${topVideos.length} videos as fallback`);
      }
    } else {
      console.log(`[processSlide] No videos to rerank`);
    }

    // Insert top videos (up to 3) into database
    if (topVideos.length > 0) {
      console.log(`[processSlide] Preparing to insert ${topVideos.length} videos into database`);
      const videoInserts = topVideos.map((video, idx) => {
        const insert: any = {
          topic_id: topic.id,
          youtube_id: video.youtube_id,
          title: video.title,
          description: truncate(video.description || '', 500),
          thumbnail_url: video.thumbnail_url,
        };
        // Only include duration if the column exists (will try without it if this fails)
        if (video.duration) {
          insert.duration = video.duration;
        }
        console.log(`[processSlide] Video ${idx + 1}: ${video.title} (${video.youtube_id})`);
        return insert;
      });

      console.log(`[processSlide] Inserting videos into database...`);
      let { data: insertedVideos, error: videoInsertErr } = await supabase
        .from("videos")
        .insert(videoInserts)
        .select();
        
      // If insert fails due to missing duration column, retry without duration
      if (videoInsertErr && videoInsertErr.message?.includes("duration")) {
        console.warn(`[processSlide] Insert failed due to duration column, retrying without duration field`);
        const videoInsertsNoDuration = videoInserts.map(({ duration, ...rest }) => rest);
        const retryResult = await supabase
          .from("videos")
          .insert(videoInsertsNoDuration)
          .select();
        insertedVideos = retryResult.data;
        videoInsertErr = retryResult.error;
      }
        
      if (videoInsertErr) {
        console.error(`[processSlide] Failed to insert videos:`, videoInsertErr);
        console.error(`[processSlide] Error details:`, JSON.stringify(videoInsertErr, null, 2));
        // Don't fail the whole operation if video insert fails
      } else {
        console.log(`[processSlide] Successfully inserted ${insertedVideos?.length ?? videoInserts.length} videos`);
        if (insertedVideos && insertedVideos.length > 0) {
          console.log(`[processSlide] Inserted video IDs:`, insertedVideos.map((v: any) => v.id));
        }
      }
    } else {
      console.log(`[processSlide] No videos to insert (topVideos.length = ${topVideos.length})`);
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

    await supabase.from("slides").update({ ai_summary_json: { status: "processing" } }).in("id", slides.map((s: any) => s.id));

    const concurrency = Number(Deno.env.get("CONCURRENCY") || 3);
    const groups = pool(slides, Math.max(1, Math.min(6, concurrency)));
    const results: SlideResult[] = [];
    
    for (const group of groups) {
      const batch = await Promise.all(
        group.map((s) => processSlide({ supabase, slide: s, apiKey, youtubeApiKey, model }))
      );
      results.push(...batch);
    }

    const topicsInserted = results.filter(r => r.ok).length;
    return json({
      topicsInserted,
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
