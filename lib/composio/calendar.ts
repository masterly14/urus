import { Composio } from "@composio/core";
import { COMPOSIO_DIRECT_API_MAX_RETRIES } from "@/lib/visit-scheduling/constants";
import type {
  CalendarFreeBusyResult,
  CalendarEventCreateResult,
  FreeBusyBlock,
} from "@/lib/visit-scheduling/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getComposioClient() {
  return new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  label: string,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
        console.warn(
          `[composio/calendar] ${label} intento ${attempt}/${maxRetries} falló, retry en ${delay}ms`,
          err,
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

/**
 * Parse the `data` field returned by Composio tool execution.
 * The shape varies: sometimes it's a JSON string, sometimes already an object.
 */
function parseComposioData(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return { raw };
    }
  }
  if (typeof raw === "object" && raw !== null) {
    return raw as Record<string, unknown>;
  }
  return { raw };
}

// ---------------------------------------------------------------------------
// getFreeBusy — API directa (sin agente LLM)
// ---------------------------------------------------------------------------

export async function getFreeBusy(
  composioUserId: string,
  timeMin: string,
  timeMax: string,
): Promise<CalendarFreeBusyResult> {
  const composio = getComposioClient();

  return withRetries(
    async () => {
      const result = await composio.tools.execute(
        "GOOGLECALENDAR_FIND_FREE_SLOTS",
        {
          userId: composioUserId,
          arguments: {
            items: ["primary"],
            time_min: timeMin,
            time_max: timeMax,
            timezone: "Europe/Madrid",
          },
          dangerouslySkipVersionCheck: true,
        },
      );

      if (!result.successful) {
        return {
          success: false,
          busy: [],
          error: result.error ?? "Composio FIND_FREE_SLOTS failed",
        };
      }

      const data = parseComposioData(result.data);
      const responseData =
        (data.response_data as Record<string, unknown>) ?? data;

      const calendars =
        (responseData.calendars as Record<
          string,
          { busy?: FreeBusyBlock[] }
        >) ?? {};
      const busyBlocks: FreeBusyBlock[] = [];

      for (const cal of Object.values(calendars)) {
        if (Array.isArray(cal.busy)) {
          for (const block of cal.busy) {
            busyBlocks.push({
              start: block.start,
              end: block.end,
            });
          }
        }
      }

      if (
        busyBlocks.length === 0 &&
        Array.isArray(responseData.busy_slots ?? responseData.busy)
      ) {
        const rawBusy = (responseData.busy_slots ??
          responseData.busy) as FreeBusyBlock[];
        for (const b of rawBusy) {
          busyBlocks.push({ start: b.start, end: b.end });
        }
      }

      return { success: true, busy: busyBlocks };
    },
    COMPOSIO_DIRECT_API_MAX_RETRIES,
    "getFreeBusy",
  );
}

// ---------------------------------------------------------------------------
// createCalendarEventDirect — API directa (sin agente LLM)
// ---------------------------------------------------------------------------

export interface DirectCalendarEventInput {
  summary: string;
  description: string;
  startDatetime: string;
  endDatetime: string;
  location?: string;
}

export async function createCalendarEventDirect(
  composioUserId: string,
  input: DirectCalendarEventInput,
): Promise<CalendarEventCreateResult> {
  const composio = getComposioClient();

  return withRetries(
    async () => {
      const result = await composio.tools.execute(
        "GOOGLECALENDAR_CREATE_EVENT",
        {
          userId: composioUserId,
          arguments: {
            summary: input.summary,
            description: input.description,
            start_datetime: input.startDatetime,
            end_datetime: input.endDatetime,
            timezone: "Europe/Madrid",
            location: input.location,
            create_meeting_room: false,
            send_updates: "all",
            exclude_organizer: true,
          },
          dangerouslySkipVersionCheck: true,
        },
      );

      if (!result.successful) {
        return {
          success: false,
          error: result.error ?? "Composio CREATE_EVENT failed",
        };
      }

      const data = parseComposioData(result.data);
      const responseData =
        (data.response_data as Record<string, unknown>) ?? data;

      return {
        success: true,
        eventId: (responseData.id ?? responseData.eventId) as
          | string
          | undefined,
        link: (responseData.htmlLink ?? responseData.link) as
          | string
          | undefined,
      };
    },
    COMPOSIO_DIRECT_API_MAX_RETRIES,
    "createCalendarEventDirect",
  );
}

// ---------------------------------------------------------------------------
// cancelCalendarEvent — API directa
// ---------------------------------------------------------------------------

export async function cancelCalendarEvent(
  composioUserId: string,
  eventId: string,
): Promise<{ success: boolean; error?: string }> {
  const composio = getComposioClient();

  try {
    const result = await composio.tools.execute(
      "GOOGLECALENDAR_DELETE_EVENT",
      {
        userId: composioUserId,
        arguments: {
          event_id: eventId,
          calendar_id: "primary",
        },
        dangerouslySkipVersionCheck: true,
      },
    );

    return {
      success: result.successful ?? false,
      error: result.error ?? undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// checkCalendarHealth — Ping de salud de la conexión
// ---------------------------------------------------------------------------

export async function checkCalendarHealth(
  composioUserId: string,
): Promise<{ healthy: boolean; error?: string }> {
  try {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 86_400_000);
    const result = await getFreeBusy(
      composioUserId,
      now.toISOString(),
      tomorrow.toISOString(),
    );
    return { healthy: result.success, error: result.error };
  } catch (err) {
    return {
      healthy: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// H30: se eliminó `getFreeBusyWithAgent`. El fallback con agente LLM no era
// determinista y proponía slots sobre bloques ocupados (riesgo de doble
// reserva). Ahora, si la API directa de Composio falla, `getFreeBusy` devuelve
// `success: false` y el caller debe escalar la decisión al comercial.
