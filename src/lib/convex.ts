import { ConvexReactClient } from "convex/react";

// Public deployment URL — safe to inline in the client bundle. Env var wins so
// other deployments (self-hosted Convex) can override it.
const url = (import.meta.env.VITE_CONVEX_URL as string | undefined) || "https://canny-echidna-518.convex.cloud";

export const convex = new ConvexReactClient(url);
