// src/services/calendarAi.ts
//
// Kimi (Moonshot) calendar import service.
//
// Focused, minimal fix for two observed failure modes:
//   (1) 429 engine_overloaded_error  -> transient; retry with backoff
//   (2) "response could not be parsed into calendar events" -> Kimi's JSON is
//       often wrapped in prose/markdown fences, truncated, or emits a top-level
//       object when we wanted an array. We now do forgiving extraction.

// ---------- Types ----------

export type CalendarEventSource = "manual" | "ai" | "kimi" | "recurring";

export interface CalendarEvent {
  title: string;
  event_date: string;
  end_time?: string | null;
  start_time?: string | null;
  category?: string | null;
  description?: string | null;
  color?: string | null;
  recurrence?: string | null;
  source?: CalendarEventSource;
  linked_job_id?: string | null;
}

export interface KimiImportResult {
  events: CalendarEvent[];
  warnings: string[];
  rawResponse?: string;
}

// ---------- Config ----------

const MOONSHOT_ENDPOINT = "https://api.moonshot.ai/v1/chat/completions";
const MOONSHOT_MODEL = "moonshot-v1-128k";

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 1000;
const MAX_TOKENS = 4000;

// ---------- Prompt ----------

const SYSTEM_PROMPT = `You are a calendar assistant that outputs ONLY valid JSON.

Your job: turn the user's request into a list of calendar events.

STRICT OUTPUT RULES:
- Respond with a single JSON object and NOTHING ELSE.
- No prose before or after. No markdown. No code fences.
- Shape: {"events": CalendarEvent[]}
- Each CalendarEvent has:
    "title":       string (required, concise)
    "event_date":  string in "YYYY-MM-DD" (required)
    "start_time":  string in 24h "HH:mm" or null
    "end_time":    string in 24h "HH:mm" or null
    "category":    string or null
    "description": string or null (short; extra context only)
- If the user asks for many events, include them all.
- If a time is unknown, use null rather than guessing.
- Use the user's stated year; if no year is given, assume the current year.
- Do not include any field other than those listed above.`;

function buildUserPrompt(userText: string, today: string): string {
  return [
    `Today's date is ${today}.`,
    `User request: ${userText.trim()}`,
    "",
    'Respond with JSON only, matching {"events":[...]}.',
  ].join("\n");
}

// ---------- Public API ----------

export async function importCalendarEventsWithKimi(
  userPrompt: string,
  apiKey: string,
  opts?: { signal?: AbortSignal }
): Promise<KimiImportResult> {
  if (!apiKey) {
    throw new Error("Moonshot (Kimi) API key is not set. Add it in Settings.");
  }
  if (!userPrompt || !userPrompt.trim()) {
    throw new Error("Please describe what you want added to the calendar.");
  }

  const today = new Date().toISOString().slice(0, 10);

  const body = {
    model: MOONSHOT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(userPrompt, today) },
    ],
    temperature: 0.2,
    max_tokens: MAX_TOKENS,
    response_format: { type: "json_object" as const },
  };

  const rawContent = await callKimiWithRetry(body, apiKey, opts?.signal);
  const { events, warnings } = extractEvents(rawContent);

  if (events.length === 0) {
    const err = new Error(
      "Kimi response could not be parsed into calendar events. " +
        "Try rephrasing the request, or splitting it into smaller batches."
    );
    (err as any).rawResponse = rawContent;
    throw err;
  }

  return { events, warnings, rawResponse: rawContent };
}

// ---------- HTTP with retry ----------

async function callKimiWithRetry(
  body: unknown,
  apiKey: string,
  signal?: AbortSignal
): Promise<string> {
  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    try {
      const res = await fetch(MOONSHOT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      if (res.ok) {
        const data = await res.json();
        const content: string | undefined =
          data?.choices?.[0]?.message?.content;
        if (typeof content !== "string" || content.length === 0) {
          throw new Error("Kimi returned an empty response.");
        }
        return content;
      }

      const errText = await safeReadText(res);
      const isRetryable = isRetryableStatus(res.status, errText);

      if (!isRetryable || attempt === MAX_ATTEMPTS) {
        throw new Error(
          `Kimi API error (${res.status}): ${truncate(errText, 400)}`
        );
      }

      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      const backoff = retryAfter ?? computeBackoff(attempt);
      await sleep(backoff, signal);
      lastErr = new Error(`Retry ${attempt} after status ${res.status}`);
      continue;
    } catch (e: any) {
      if (e?.name === "AbortError") throw e;
      lastErr = e instanceof Error ? e : new Error(String(e));

      const transient = isTransientNetworkError(lastErr);
      if (!transient || attempt === MAX_ATTEMPTS) throw lastErr;

      await sleep(computeBackoff(attempt), signal);
    }
  }

  throw lastErr ?? new Error("Kimi request failed.");
}

function isRetryableStatus(status: number, bodyText: string): boolean {
  if (status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (status === 408 || status === 409) return true;
  if (/engine_overloaded/i.test(bodyText)) return true;
  return false;
}

function isTransientNetworkError(err: Error): boolean {
  const m = err.message.toLowerCase();
  return (
    m.includes("networkerror") ||
    m.includes("failed to fetch") ||
    m.includes("timeout") ||
    m.includes("socket") ||
    m.includes("econnreset")
  );
}

function computeBackoff(attempt: number): number {
  const base = BASE_BACKOFF_MS * Math.pow(2, attempt - 1);
  const jitter = base * (Math.random() * 0.5 - 0.25);
  return Math.max(250, Math.round(base + jitter));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 15000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.min(date - Date.now(), 15000));
  }
  return null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---------- Resilient parsing ----------

export function extractEvents(raw: string): {
  events: CalendarEvent[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const cleaned = stripCodeFences(raw).trim();

  const candidates = collectJsonCandidates(cleaned);

  let parsed: unknown = null;
  for (const c of candidates) {
    try {
      parsed = JSON.parse(c);
      break;
    } catch {
      // try next candidate
    }
  }

  let rawEvents: unknown[] = [];

  if (parsed !== null) {
    rawEvents = normalizeToArray(parsed);
  }

  if (rawEvents.length === 0) {
    const scanned = scanObjects(cleaned);
    if (scanned.length > 0) {
      rawEvents = scanned;
      if (parsed === null) {
        warnings.push(
          "Kimi returned malformed JSON; recovered events by scanning individual objects."
        );
      } else {
        warnings.push(
          "Kimi response appeared truncated; recovered complete events only."
        );
      }
    }
  }

  const events: CalendarEvent[] = [];
  let dropped = 0;

  for (const r of rawEvents) {
    const ev = coerceEvent(r);
    if (ev) events.push(ev);
    else dropped++;
  }

  if (dropped > 0) {
    warnings.push(
      `${dropped} row${dropped === 1 ? "" : "s"} dropped because required fields (title, event_date) were missing or invalid.`
    );
  }

  return { events, warnings };
}

function stripCodeFences(s: string): string {
  return s.replace(/```(?:json)?\s*([\s\S]*?)```/gi, "$1");
}

function collectJsonCandidates(s: string): string[] {
  const out: string[] = [];
  if (s) out.push(s);
  const firstBrace = s.indexOf("{");
  const firstBracket = s.indexOf("[");
  if (firstBrace !== -1) {
    const slice = balancedSlice(s, firstBrace, "{", "}");
    if (slice) out.push(slice);
  }
  if (firstBracket !== -1) {
    const slice = balancedSlice(s, firstBracket, "[", "]");
    if (slice) out.push(slice);
  }
  return out;
}

function balancedSlice(
  s: string,
  start: number,
  open: "{" | "[",
  close: "}" | "]"
): string | null {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

function scanObjects(s: string): unknown[] {
  const results: unknown[] = [];
  let i = 0;
  while (i < s.length) {
    const openIdx = s.indexOf("{", i);
    if (openIdx === -1) break;
    const slice = balancedSlice(s, openIdx, "{", "}");
    if (!slice) {
      i = openIdx + 1;
      continue;
    }
    try {
      const obj = JSON.parse(slice);
      if (looksLikeEventObject(obj)) results.push(obj);
    } catch {
      /* skip malformed */
    }
    i = openIdx + slice.length;
  }
  return results;
}

function looksLikeEventObject(o: unknown): boolean {
  if (!o || typeof o !== "object") return false;
  const r = o as Record<string, unknown>;
  const hasTitle =
    typeof r.title === "string" ||
    typeof r.name === "string" ||
    typeof r.summary === "string";
  const hasDate =
    typeof r.event_date === "string" ||
    typeof r.date === "string" ||
    typeof r.day === "string";
  return hasTitle && hasDate;
}

function normalizeToArray(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.events)) return obj.events as unknown[];
    if (Array.isArray(obj.calendar)) return obj.calendar as unknown[];
    if (Array.isArray(obj.items)) return obj.items as unknown[];
    if (Array.isArray(obj.data)) return obj.data as unknown[];
    if (typeof obj.title === "string" && typeof obj.event_date === "string") {
      return [obj];
    }
  }
  return [];
}

function coerceEvent(raw: unknown): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const title = asString(r.title ?? r.name ?? r.summary);
  const event_date = asIsoDate(r.event_date ?? r.date ?? r.day);
  if (!title || !event_date) return null;

  const start_time = asHHMM(r.start_time ?? r.time ?? r.kick_off ?? r.kickoff);
  const end_time = asHHMM(r.end_time ?? r.finish_time);
  const category = asString(r.category ?? r.type);
  const description = asString(r.description ?? r.notes ?? r.details);
  const color = asString(r.color ?? r.colour);
  const recurrence = asString(r.recurrence ?? r.repeat);

  return {
    title,
    event_date,
    start_time: start_time ?? null,
    end_time: end_time ?? null,
    category: category ?? null,
    description: description ?? null,
    color: color ?? null,
    recurrence: recurrence ?? null,
    source: "kimi",
  };
}

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function asIsoDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function asHHMM(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m24 = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (m24) {
    const h = Number(m24[1]);
    const mi = Number(m24[2]);
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      return `${String(h).padStart(2, "0")}:${m24[2]}`;
    }
  }
  const m12 = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i.exec(t);
  if (m12) {
    let h = Number(m12[1]);
    const mi = m12[2] ? Number(m12[2]) : 0;
    const pm = m12[3].toLowerCase() === "p";
    if (h === 12) h = 0;
    if (pm) h += 12;
    if (h >= 0 && h <= 23 && mi >= 0 && mi <= 59) {
      return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    }
  }
  return null;
}
