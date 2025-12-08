import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";

type SlideResult = { id: string; ok: boolean; ms: number; err?: string; rawSnippet?: string };

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

async function processSlide({ supabase, slide, apiKey, model }: { supabase: any; slide: any; apiKey: string; model: string }): Promise<SlideResult> {
    const t0 = Date.now();
    try {
        const { data: signed, error: signedErr } = await supabase.storage.from("slides").createSignedUrl(slide.file_url, 60 * 5);
        if (signedErr) throw signedErr;
        const bytes = await bytesFromSignedUrl(signed.signedUrl);

        const res = await summarizePdfWithGemini(apiKey, model, bytes);
        const title = (res.title || (slide.file_url?.split("/").pop() || "Slide")).slice(0, 200);
        const subpoints = (res.subpoints || []).slice(0, 12);

        if (subpoints.length === 0) throw new Error(`Empty subpoints from Gemini | raw=${truncate(res.raw, 200)}`);

        const { error: insertErr } = await supabase.from("topics").insert({ slide_id: slide.id, title, subpoints_json: subpoints });
        if (insertErr) throw insertErr;

        await supabase.from("slides").update({ ai_summary_json: { status: "done" } }).eq("id", slide.id);
        return { id: slide.id, ok: true, ms: Date.now() - t0 };
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await supabase.from("slides").update({ ai_summary_json: { status: "error" } }).eq("id", slide.id);
        return { id: slide.id, ok: false, ms: Date.now() - t0, err: msg, rawSnippet: msg.includes("raw=") ? msg.split("raw=")[1] : undefined };
    }
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
    }
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";
    const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash-latest";
    const authHeader = req.headers.get("Authorization");

    if (!supabaseUrl || !supabaseAnonKey) return json({ error: "Server env not configured" }, 500);
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    if (!apiKey) return json({ error: "GEMINI_API_KEY not set on Edge Function" }, 400);

    try {
        const { slideId, filePath } = await req.json().catch(() => ({})) as { slideId?: string; filePath?: string };
        if (!slideId || !filePath) return json({ error: "Missing slideId or filePath" }, 400);

        const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

        // Mark as processing
        await supabase.from("slides").update({ ai_summary_json: { status: "processing" } }).eq("id", slideId);

        const slide = { id: slideId, file_url: filePath };
        const result = await processSlide({ supabase, slide, apiKey, model });

        return json({ ok: result.ok, result });
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return json({ error: msg }, 500);
    }
});
