import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

type SlideResult = { id: string; ok: boolean; ms: number; err?: string; rawSnippet?: string };

// ... (imports and helper functions remain the same)

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
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch { }
  // Try to extract first top-level JSON object
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const maybe = text.slice(start, end + 1);
    try { return JSON.parse(maybe); } catch { }
  }
  return null;
}

async function geminiCall(key: string, model: string, parts: any[]): Promise<any> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const body = { contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 768, responseMimeType: "application/json" } };
  const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!resp.ok) {
    const errTxt = await resp.text().catch(() => resp.statusText);
    throw new Error(`Gemini ${model} ${resp.status} ${errTxt}`);
  }
  return await resp.json();
}

const MOCK_VIDEOS = [
  { youtube_id: "2ixEf2zpR8E", title: "Thermochemistry Equations & Formulas", thumbnail_url: "https://img.youtube.com/vi/2ixEf2zpR8E/hqdefault.jpg" },
  { youtube_id: "qDrcHR4tSdE", title: "Thermochemical Equations Practice Problems", thumbnail_url: "https://img.youtube.com/vi/qDrcHR4tSdE/hqdefault.jpg" },
  { youtube_id: "NyOYW07-L5g", title: "First Law of Thermodynamics", thumbnail_url: "https://img.youtube.com/vi/NyOYW07-L5g/hqdefault.jpg" }
];

async function searchYouTube(apiKey: string, query: string): Promise<{ youtube_id: string; title: string; thumbnail_url: string } | null> {
  // Mock implementation: Return a random video from the list
  const randomVideo = MOCK_VIDEOS[Math.floor(Math.random() * MOCK_VIDEOS.length)];
  return randomVideo;
}

// ... (summarizePdfWithGemini and generateVideoQuery remain the same)

async function summarizePdfWithGemini(key: string, model: string, pdfBytes: Uint8Array): Promise<{ title: string; subpoints: string[]; raw: string }> {
  const b64 = encodeBase64(pdfBytes);
  const baseParts = [{ text: "You are summarizing a single slide of study material into a concise topic with 3-7 bullet subpoints. Return STRICT JSON: {\"title\": string, \"subpoints\": string[]} only." }, { inlineData: { mimeType: "application/pdf", data: b64 } }];

  // First attempt
  let data = await geminiCall(key, model, baseParts);
  let raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  let parsed = parseJsonish(raw);
  let title = String(parsed?.title ?? "Summary");
  let subpoints = Array.isArray(parsed?.subpoints) ? parsed!.subpoints.map((s: unknown) => String(s)).filter(Boolean) : [];

  // Fallback prompt if empty
  if (subpoints.length === 0) {
    const fallbackParts = [{ text: "Return JSON {title, subpoints}. Ensure subpoints has at least 3 concise bullets extracted or inferred from the slide. If slide is images only, infer key talking points." }, { inlineData: { mimeType: "application/pdf", data: b64 } }];
    data = await geminiCall(key, model, fallbackParts);
    raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? raw;
    parsed = parseJsonish(raw) ?? parsed;
    title = String(parsed?.title ?? title);
    subpoints = Array.isArray(parsed?.subpoints) ? parsed!.subpoints.map((s: unknown) => String(s)).filter(Boolean) : subpoints;
  }

  return { title, subpoints, raw };
}

async function bytesFromSignedUrl(signedUrl: string): Promise<Uint8Array> {
  const r = await fetch(signedUrl);
  if (!r.ok) throw new Error(`Fetch slide failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const MOCK_DATA = [
  {
    title: "Thermochemistry Equations & Formulas",
    description: "This chemistry lecture reviews thermochemistry equations and formulas, including internal energy, heat, and work. It demonstrates calculations for processes involving temperature and phase changes, using examples like water's specific heat capacity. Practice problems on stoichiometry and conversions are also included.",
    youtube_id: "2ixEf2zpR8E",
    thumbnail_url: "https://img.youtube.com/vi/2ixEf2zpR8E/hqdefault.jpg"
  },
  {
    title: "Thermochemical Equations Practice Problems",
    description: "Master thermochemical equations by converting grams to kilojoules and vice-versa. This video demonstrates the process using balanced chemical equations and molar mass calculations. Practice problems cover various scenarios, including heat released and product formation.",
    youtube_id: "qDrcHR4tSdE",
    thumbnail_url: "https://img.youtube.com/vi/qDrcHR4tSdE/hqdefault.jpg"
  },
  {
    title: "First Law of Thermodynamics",
    description: "This chemistry tutorial introduces the first law of thermodynamics, explaining the relationship between internal energy, heat, and work. It explores different system types—open, closed, and isolated—and their properties. The video uses analogies to illustrate energy transfer and sign conventions for heat and work.",
    youtube_id: "NyOYW07-L5g",
    thumbnail_url: "https://img.youtube.com/vi/NyOYW07-L5g/hqdefault.jpg"
  }
];

async function processSlide({ supabase, slide, apiKey, youtubeApiKey, model }: { supabase: any; slide: any; apiKey: string; youtubeApiKey: string; model: string }): Promise<SlideResult> {
  const t0 = Date.now();
  try {
    // MOCK MODE: Ignore actual slide content and Gemini summarization.
    // Map slide ID (or random) to one of the mock items.
    // For deterministic behavior across re-runs on same slide, use hash or just index if possible.
    // Since we don't have index here easily without passing it, let's pick based on char code of ID.
    const mockIndex = slide.id.charCodeAt(0) % MOCK_DATA.length;
    const mockItem = MOCK_DATA[mockIndex];

    const title = mockItem.title;
    const subpoints = ["Key Concept 1", "Key Concept 2", "Key Concept 3"]; // Dummy subpoints

    // Insert Topic
    const { data: topic, error: insertErr } = await supabase.from("topics").insert({
      slide_id: slide.id,
      title,
      subpoints_json: subpoints
    }).select('id').single();

    if (insertErr) throw insertErr;

    // Insert Video
    await supabase.from("videos").insert({
      topic_id: topic.id,
      youtube_id: mockItem.youtube_id,
      title: mockItem.title,
      description: mockItem.description,
      thumbnail_url: mockItem.thumbnail_url
    });

    await supabase.from("slides").update({ ai_summary_json: { status: "done" } }).eq("id", slide.id);
    return { id: slide.id, ok: true, ms: Date.now() - t0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase.from("slides").update({ ai_summary_json: { status: "error" } }).eq("id", slide.id);
    return { id: slide.id, ok: false, ms: Date.now() - t0, err: msg, rawSnippet: msg.includes("raw=") ? msg.split("raw=")[1] : undefined };
  }
}

function pool<T>(items: T[], size: number): T[][] { const buckets: T[][] = Array.from({ length: size }, () => []); items.forEach((it, i) => buckets[i % size].push(it)); return buckets; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY") || "";
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash-latest";
  const authHeader = req.headers.get("Authorization");

  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Server env not configured" }, 500);
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  if (!apiKey) return json({ error: "GEMINI_API_KEY not set on Edge Function" }, 400);

  try {
    const { examId } = await req.json().catch(() => ({ examId: null })) as { examId: string | null };
    if (!examId) return json({ error: "Missing examId" }, 400);

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

    const { data: slides, error: slidesErr } = await supabase.from("slides").select("id, file_url").eq("exam_id", examId).order("created_at", { ascending: true });
    if (slidesErr) return json({ error: slidesErr.message }, 400);

    if (!slides || slides.length === 0) return json({ topicsInserted: 0, diagnostics: { hasKey: true, model, slideCount: 0, results: [] } });

    await supabase.from("slides").update({ ai_summary_json: { status: "processing" } }).in("id", slides.map((s: any) => s.id));

    const concurrency = Number(Deno.env.get("CONCURRENCY") || 3);
    const groups = pool(slides, Math.max(1, Math.min(6, concurrency)));
    const results: SlideResult[] = [];
    for (const group of groups) {
      const batch = await Promise.all(group.map((s) => processSlide({ supabase, slide: s, apiKey, youtubeApiKey, model })));
      results.push(...batch);
    }

    const topicsInserted = results.filter(r => r.ok).length;
    return json({ topicsInserted, diagnostics: { hasKey: true, model, slideCount: slides.length, results } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
