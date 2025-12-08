import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type YouTubeVideo = {
  youtube_id: string;
  title: string;
  description?: string;
  thumbnail_url: string;
  duration?: number;
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

async function searchYouTube(apiKey: string, query: string): Promise<YouTubeVideo[]> {
  if (!apiKey || apiKey.trim().length === 0) {
    return [];
  }

  try {
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=5&q=${encodeURIComponent(query)}&type=video&key=${encodeURIComponent(apiKey)}`;
    const searchResp = await fetch(searchUrl);
    
    if (!searchResp.ok) {
      const errorText = await searchResp.text().catch(() => searchResp.statusText);
      throw new Error(`YouTube Search API error: ${searchResp.status} ${errorText}`);
    }

    const searchData = await searchResp.json();
    
    if (!searchData.items || searchData.items.length === 0) {
      return [];
    }

    const videoIds = searchData.items.map((item: any) => item.id.videoId).join(',');
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoIds}&key=${encodeURIComponent(apiKey)}`;
    const detailsResp = await fetch(detailsUrl);
    
    if (!detailsResp.ok) {
      return searchData.items.map((item: any) => ({
        youtube_id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
      }));
    }

    const detailsData = await detailsResp.json();
    
    function parseDuration(isoDuration: string): number {
      const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (!match) return 0;
      const hours = parseInt(match[1] || '0', 10);
      const minutes = parseInt(match[2] || '0', 10);
      const seconds = parseInt(match[3] || '0', 10);
      return hours * 3600 + minutes * 60 + seconds;
    }

    return detailsData.items.map((item: any) => ({
      youtube_id: item.id,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail_url: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url || '',
      duration: parseDuration(item.contentDetails.duration || 'PT0S'),
    }));
  } catch (e) {
    console.error(`YouTube search error:`, e);
    return [];
  }
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

  const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY") || "";
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  if (!youtubeApiKey) return json({ error: "YOUTUBE_API_KEY not set" }, 400);

  try {
    const { videoTitle, topicTitle, excludeVideoIds } = await req.json().catch(() => ({})) as { 
      videoTitle?: string; 
      topicTitle?: string;
      excludeVideoIds?: string[];
    };
    
    if (!videoTitle && !topicTitle) {
      return json({ error: "videoTitle or topicTitle required" }, 400);
    }

    // Create search query from video title and topic
    const searchQuery = `${videoTitle || topicTitle} tutorial explanation`.trim();
    
    // Search for alternative videos
    const videos = await searchYouTube(youtubeApiKey, searchQuery);
    
    // Filter out the current video and any excluded videos
    const filtered = videos.filter(v => {
      if (!excludeVideoIds) return true;
      return !excludeVideoIds.includes(v.youtube_id);
    });
    
    // Return top 3
    return json({ videos: filtered.slice(0, 3) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});

