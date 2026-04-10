import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { checkRateLimit, rateLimitResponse, AUTH_CONFIG } from "@/lib/api/rate-limit";

const { GET: rawGET, POST: rawPOST } = toNextJsHandler(auth);

export const GET = rawGET;

export async function POST(request: Request) {
  const rl = checkRateLimit(request, "auth", AUTH_CONFIG);
  if (!rl.allowed) return rateLimitResponse(rl.resetAt);
  return rawPOST(request);
}
