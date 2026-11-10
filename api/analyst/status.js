export const config = { runtime: "edge" };

// When this deployment has no key of its own, report the status of the
// all-in-one Render service so the UI knows the analyst is reachable.
const FALLBACK = "https://nav-y35d.onrender.com/api/analyst/status";

export default async function handler() {
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  if (!process.env.GROQ_API_KEY) {
    try {
      const res = await fetch(FALLBACK, { headers: { accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        return new Response(JSON.stringify(data), {
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
    } catch {
      /* fall through to the local answer */
    }
  }
  return new Response(
    JSON.stringify({
      configured: Boolean(process.env.GROQ_API_KEY),
      model,
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
