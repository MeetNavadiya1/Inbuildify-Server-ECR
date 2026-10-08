// Lightweight in-memory, per-IP rate limiter (no external dependency).
// Guards the public, unauthenticated endpoints so a single machine cannot spam
// the server/DB with repeated requests. Sufficient for a single node; for a
// multi-instance deploy swap the Map for a shared store (e.g. Redis).

const buckets = new Map();

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = 0;

function clientIp(req) {
  // Behind the devtunnel / a reverse proxy the real client is in x-forwarded-for.
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length) return xff.split(",")[0].trim();
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function rateLimit({
  windowMs = 60_000,
  max = 30,
  message = "Too many requests. Please slow down and try again shortly.",
} = {}) {
  return (req, res, next) => {
    const now = Date.now();

    // Opportunistic sweep so the Map doesn't grow unbounded.
    if (now - lastSweep > SWEEP_INTERVAL_MS) {
      for (const [k, b] of buckets) {
        if (now - b.start > b.windowMs) buckets.delete(k);
      }
      lastSweep = now;
    }

    const key = `${clientIp(req)}:${req.method}:${req.baseUrl || ""}${req.path || ""}`;
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0, windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - bucket.count));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.start + windowMs - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      // Also in the body, so a client can show a countdown without reading headers.
      return res
        .status(429)
        .json({ success: false, statusCode: 429, message, data: { retryAfterSeconds: retryAfter } });
    }
    next();
  };
}

export default rateLimit;
