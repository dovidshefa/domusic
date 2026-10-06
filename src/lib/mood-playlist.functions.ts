import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type MoodPlaylistResult =
  | { ok: true; name: string; description: string; trackIds: string[] }
  | { ok: false; error: string };

export const generateMoodPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ prompt: z.string().trim().min(2).max(300), count: z.number().int().min(3).max(50) }).parse(d))
  .handler(async ({ data, context }): Promise<MoodPlaylistResult> => {
    const { data: rows, error } = await context.supabase
      .from("tracks")
      .select("id, song, artist, album, genre, kind, liked, plays")
      .eq("user_id", context.userId)
      .limit(1500);
    if (error) return { ok: false, error: "Couldn't read your library." };
    if (!rows || rows.length === 0) return { ok: false, error: "Your library is empty — upload some songs first." };

    const catalog = rows
      .map((t, i) => `${i}|${t.song}|${t.artist}|${t.album}|${t.genre ?? ""}|${t.kind}${t.liked ? "|♥" : ""}`)
      .join("\n");
    const want = Math.min(data.count, rows.length);

    const { createOpenAI } = await import("@ai-sdk/openai");
    const { streamText, Output, NoObjectGeneratedError } = await import("ai");
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return { ok: false, error: "AI is not configured." };
    const provider = createOpenAI({
      baseURL: "https://ai.gateway.lovable.dev/v1",
      apiKey,
      headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    });

    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      instructions:
        "You are a music curator. Build a playlist ONLY from the listener's library catalog. " +
        "Each catalog line is: index|title|artist|album|genre|kind(audio/video)|♥ if liked. " +
        `Pick up to ${want} tracks that best fit the mood or activity, ordered for a good listening flow (energy arc). ` +
        "Use your knowledge of the songs/artists when titles are recognizable; otherwise infer from title, artist and genre. " +
        "Return indexes only from the catalog, no duplicates. Give a short catchy playlist name (max 40 chars) and a one-sentence description.",
      prompt: `Mood / activity: ${data.prompt}\n\nCatalog:\n${catalog}`,
      output: Output.object({
        schema: z.object({ name: z.string(), description: z.string(), indexes: z.array(z.number()) }),
      }),
      providerOptions: { openai: { store: false, forceReasoning: true, reasoningEffort: "low" } },
    });

    try {
      const out = await result.output;
      const seen = new Set<number>();
      const trackIds: string[] = [];
      for (const n of out.indexes) {
        const i = Math.trunc(n);
        if (i < 0 || i >= rows.length || seen.has(i)) continue;
        seen.add(i);
        trackIds.push(rows[i].id);
        if (trackIds.length >= want) break;
      }
      if (trackIds.length === 0) return { ok: false, error: "No songs in your library fit that mood. Try describing it differently." };
      return { ok: true, name: out.name.slice(0, 60) || data.prompt.slice(0, 40), description: out.description.slice(0, 200), trackIds };
    } catch (e) {
      if (NoObjectGeneratedError.isInstance(e)) return { ok: false, error: "The AI returned an unexpected answer. Please try again." };
      const status = (e as { statusCode?: number })?.statusCode;
      if (status === 429) return { ok: false, error: "Too many requests right now — wait a moment and try again." };
      if (status === 402) return { ok: false, error: "AI credits are used up. Add credits in workspace settings to keep using this." };
      console.error("mood playlist failed", e);
      return { ok: false, error: "Couldn't create the playlist right now." };
    }
  });
