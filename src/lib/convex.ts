import { ConvexReactClient } from "convex/react";

const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
if (!url) throw new Error("VITE_CONVEX_URL is not set — copy .env.example to .env.local.");

export const convex = new ConvexReactClient(url);
