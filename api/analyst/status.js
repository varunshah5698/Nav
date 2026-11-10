export const config = { runtime: "edge" };

export default function handler() {
  return new Response(
    JSON.stringify({
      configured: Boolean(process.env.GROQ_API_KEY),
      model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
