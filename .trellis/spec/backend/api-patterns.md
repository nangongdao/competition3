# API Module Patterns

> Best practices, common patterns, and anti-patterns.

---

## Best Practices

**DO**:

```typescript
// 1. Always validate inputs with Zod
const input = createWorkspaceInputSchema.parse(await c.req.json());

// 2. Use typed return values
export const createWorkspace: MiddlewareHandler<AppEnv> = async (c) => {
  // ...
  const output: CreateWorkspaceOutput = { success: true, workspace };
  return c.json(output);
};

// 3. Extract reusable logic to lib/
const workspace = await getWorkspaceWithAuth(db, workspaceId, userId);

// 4. Use structured logging
const logger = c.get("logger");
logger.info("workspace_created", { workspaceId });

// 5. Return consistent response format
return c.json({ success: true, workspace });
return c.json({ success: false, reason: "Already exists" }, 409);

// 6. Import types from types.ts
import type { Workspace, CreateWorkspaceInput } from "../types";
```

**DON'T**:

```typescript
// 1. Don't skip validation
export const createWorkspace = async (c) => {
  const body = await c.req.json();  // No validation
  await db.insert(workspaces).values(body);  // Unvalidated input
};

// 2. Don't define types inline
export const createWorkspace = async (
  c,
  input: { name: string; description?: string }  // Define in types.ts
) => { /* ... */ };

// 3. Don't duplicate logic
// Same auth check in every procedure
const workspace = await db.query.workspaces.findFirst(...);
if (!workspace) throw new Error("Not found");
// Check membership...

// Extract to lib/workspace-utils.ts
const workspace = await getWorkspaceWithAuth(db, workspaceId, userId);

// 4. Don't use console.log
console.log("Workspace created");  // Use logger
logger.info("workspace_created", { workspaceId });  // Good

// 5. Don't return inconsistent formats
return workspace;  // Inconsistent
return { success: true, workspace };  // Consistent
```

---

## Common Patterns

### Scenario: Chat Completions Compatibility Endpoint

#### 1. Scope / Trigger

- Trigger: adding or changing a backend endpoint that calls an ordinary
  OpenAI-compatible `/chat/completions` provider for text plus optional camera
  frame input.
- This is the broad third-party provider path; do not require Realtime/WebRTC
  support for this mode.

#### 2. Signatures

- Route: `POST /api/chat/completion`
- Request schema source: `src/worker/routes/chat/types.ts`
- Hono app mount: `app.route("/api/chat", chatRoutes)`

#### 3. Contracts

Request JSON:

| Field | Type | Required | Constraints |
| --- | --- | :---: | --- |
| `message` | `string` | Yes | Trimmed, 1 to 4000 chars |
| `imageDataUrl` | `string` | No | Must start with `data:image/`; use only with vision-capable models |
| `responseBudget` | `"brief" \| "standard" \| "detailed"` | No | Defaults to `"standard"`; maps to the configured upstream token limit field |
| `instructions` | `string` | No | Trimmed, 1 to 1200 chars when present |

Success response:

```typescript
{
  success: true,
  answer: string,
  model: string,
}
```

Environment:

| Key | Required | Notes |
| --- | :---: | --- |
| `OPENAI_API_KEY` | Yes for real calls | Worker secret or `.dev.vars`; never a frontend `VITE_` variable |
| `OPENAI_PROVIDER_MODE` | No | `chat` or `realtime`; frontend default only, defaults to `chat` |
| `OPENAI_BASE_URL` | No | Shared provider root, default `https://api.openai.com/v1` |
| `OPENAI_CHAT_BASE_URL` | No | Chat-specific provider root override |
| `OPENAI_CHAT_COMPLETIONS_PATH` | No | Defaults to `/chat/completions` |
| `OPENAI_CHAT_COMPLETIONS_URL` | No | Full endpoint override when base plus path cannot represent provider routing |
| `OPENAI_CHAT_MODEL` | Yes | Chat or vision-chat provider model ID |
| `OPENAI_CHAT_TOKEN_LIMIT_PARAMETER` | No | `max_tokens`, `max_completion_tokens`, or `none`; defaults to `max_tokens` |
| `OPENAI_CHAT_VISION_INPUT` | No | `enabled` or `disabled`; defaults to `enabled` |

#### 4. Validation & Error Matrix

| Condition | Status | Response |
| --- | ---: | --- |
| Missing `OPENAI_API_KEY` | 503 | `{ success: false, code: "missing_openai_api_key" }` |
| Missing `OPENAI_CHAT_MODEL` | 503 | `{ success: false, code: "missing_chat_model" }` |
| Invalid provider URL config | 503 | `{ success: false, code: "invalid_chat_provider_config" }` |
| Zod validation failure | 400 | `{ success: false, code: "invalid_request" }` |
| Provider request failure | 502 | `{ success: false, code: "chat_completion_failed" }` |
| Provider response lacks text content | 502 | `{ success: false, code: "invalid_chat_completion_response" }` |
| Provider success | 200 | `{ success: true, answer, model }` |

#### 5. Good/Base/Bad Cases

- Good: browser sends text and an optional sampled JPEG data URL to the Worker;
  Worker calls the provider with `messages` containing text and `image_url`
  content blocks.
- Base: text-only models can answer typed messages but cannot understand camera
  frames. Use `OPENAI_CHAT_VISION_INPUT=disabled` so the Worker omits image
  content when a text-only provider rejects multimodal messages.
- Base: providers that reject `max_tokens` can use
  `OPENAI_CHAT_TOKEN_LIMIT_PARAMETER=max_completion_tokens` or `none` without
  changing frontend code.
- Bad: browser code stores the permanent API key, provider base URL, or model
  secret in `VITE_*`, localStorage, or query parameters.
- Bad: Chat mode is treated as a Realtime session; it is ordinary stateless HTTP
  and does not stream microphone audio.

#### 6. Tests Required

- Missing key maps to 503.
- Missing chat model maps to 503.
- Invalid provider URL configuration maps to 503.
- Invalid input maps to 400.
- Upstream provider failure maps to 502.
- Success test asserts the upstream URL, model, `max_tokens`, and text plus
  `image_url` message shape.
- Compatibility tests assert `max_completion_tokens` mapping, omitted token
  limit behavior, disabled vision input behavior, and non-JSON upstream error
  body surfacing.

#### 7. Wrong vs Correct

Wrong:

```typescript
// Assumes every OpenAI-compatible provider accepts the same optional fields.
const payload = {
  model,
  messages,
  max_tokens: 800,
};
```

Correct:

```typescript
const payload = buildChatCompletionPayload({
  model,
  instructions,
  responseBudget,
  message,
  imageDataUrl: env.OPENAI_CHAT_VISION_INPUT === "disabled"
    ? undefined
    : imageDataUrl,
  tokenLimitParameter: resolveChatTokenLimitParameter(
    env.OPENAI_CHAT_TOKEN_LIMIT_PARAMETER,
  ),
});
```

### Scenario: Realtime Session Creation Endpoint

#### 1. Scope / Trigger

- Trigger: adding or changing a backend endpoint that creates a short-lived AI
  session for browser clients.
- This is an infra and cross-layer contract because the browser receives a
  temporary session object while the Worker owns the permanent provider key.

#### 2. Signatures

- Route: `POST /api/realtime/session`
- Request schema source: `src/worker/routes/realtime/types.ts`
- Hono app mount: `app.route("/api/realtime", realtimeRoutes)`

#### 3. Contracts

Request JSON:

| Field | Type | Required | Constraints |
| --- | --- | :---: | --- |
| `instructions` | `string` | No | Trimmed, 1 to 1200 chars when present |
| `visualContextMode` | `"manual" \| "interval"` | No | Defaults to `"manual"` |
| `turnDetectionMode` | `"server-vad" \| "push-to-talk"` | No | Defaults to `"server-vad"`; push-to-talk maps to `turn_detection: null` upstream |
| `responseBudget` | `"brief" \| "standard" \| "detailed"` | No | Defaults to `"standard"`; maps to upstream `max_response_output_tokens` |

Success response:

```typescript
{
  success: true,
  session: unknown,
  costPolicy: {
    visualContextMode: "manual" | "interval",
    turnDetectionMode: "server-vad" | "push-to-talk",
    responseBudget: "brief" | "standard" | "detailed",
    maxResponseOutputTokens: number,
    maxSessionSeconds: number,
    frameUpload: "manual-or-interval",
  },
}
```

Environment:

| Key | Required | Notes |
| --- | :---: | --- |
| `OPENAI_API_KEY` | Yes for real sessions | Must be a Worker secret or `.dev.vars` value, never a frontend `VITE_` variable |
| `OPENAI_REALTIME_MODEL` | No | Optional model override; default lives in code |
| `OPENAI_REALTIME_VOICE` | No | Optional voice override; default lives in code |

#### 4. Validation & Error Matrix

| Condition | Status | Response |
| --- | ---: | --- |
| Missing `OPENAI_API_KEY` | 503 | `{ success: false, code: "missing_openai_api_key" }` |
| Invalid JSON | 400 | Global `HTTPException` error response |
| Zod validation failure | 400 | `{ success: false, code: "invalid_request" }` |
| Invalid `turnDetectionMode` | 400 | `{ success: false, code: "invalid_request" }` |
| Invalid `responseBudget` | 400 | `{ success: false, code: "invalid_request" }` |
| Provider session creation failure | 502 | `{ success: false, code: "openai_session_failed" }` |
| Provider success | 200 | `{ success: true, session, costPolicy }` |

#### 5. Good/Base/Bad Cases

- Good: `POST { "visualContextMode": "manual" }` with a configured key returns
  `success: true`, defaults to the standard response budget, and never includes
  the permanent API key.
- Base: empty JSON body is accepted and defaults to manual visual context mode,
  server VAD, and the standard response budget.
- Bad: browser code must not read or embed `OPENAI_API_KEY`; only the Worker
  may call the upstream Realtime session API.

#### 6. Tests Required

- Typecheck verifies `CloudflareBindings` includes the session env keys.
- Unit or integration test should assert missing key returns 503.
- Contract test should assert invalid `visualContextMode` returns 400.
- Contract test should assert invalid `turnDetectionMode` returns 400.
- Contract test should assert invalid `responseBudget` returns 400.
- Mocked provider test should assert push-to-talk writes
  `turn_detection: null` and default server VAD omits that override.
- Mocked provider test should assert response budget presets write
  `max_response_output_tokens` values and that brief mode appends a brevity
  instruction.
- Mocked provider test should assert upstream failures map to 502.
- Browser smoke test should confirm local media/mock mode still works when the
  session endpoint is not configured.

#### 7. Wrong vs Correct

Wrong:

```typescript
// Browser bundle exposes a permanent key.
fetch("https://api.openai.com/v1/realtime/sessions", {
  headers: { Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}` },
});
```

Correct:

```typescript
// Browser asks same-origin backend for a short-lived session.
await fetch("/api/realtime/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ visualContextMode: "manual" }),
});
```

### Scenario: Chat Voice Transcription Endpoint

#### 1. Scope / Trigger

- Trigger: adding or changing a backend endpoint that accepts short browser
  recordings and calls an OpenAI-compatible audio transcription provider.
- This is the provider-compatible STT path for Chat mode; it must not require
  Realtime/WebRTC support.

#### 2. Signatures

- Route: `POST /api/speech/transcription`
- Request content type: `multipart/form-data`
- Request schema source: `src/worker/routes/speech/types.ts`
- Hono app mount: `app.route("/api/speech", speechRoutes)`

#### 3. Contracts

Request form data:

| Field | Type | Required | Constraints |
| --- | --- | :---: | --- |
| `audio` | `File` | Yes | Non-empty, max 10 MB, supported `audio/*` MIME type |
| `language` | `string` | No | Trimmed, 1 to 16 chars; overrides env language when present |

Success response:

```typescript
{
  success: true,
  text: string,
  model: string,
}
```

Environment:

| Key | Required | Notes |
| --- | :---: | --- |
| `OPENAI_API_KEY` | Yes for real calls | Worker secret or `.dev.vars`; never a frontend variable |
| `OPENAI_BASE_URL` | No | Shared provider root, default `https://api.openai.com/v1` |
| `OPENAI_TRANSCRIPTION_BASE_URL` | No | Transcription-specific provider root override |
| `OPENAI_TRANSCRIPTIONS_PATH` | No | Defaults to `/audio/transcriptions` |
| `OPENAI_TRANSCRIPTIONS_URL` | No | Full endpoint override when base plus path cannot represent provider routing. A non-empty value takes precedence over base/path and must itself be a valid absolute URL. |
| `OPENAI_TRANSCRIPTION_MODEL` | No | Defaults to `whisper-1` |
| `OPENAI_TRANSCRIPTION_LANGUAGE` | No | Optional provider language hint; request `language` takes precedence |

Upstream payload:

- Multipart form data with `model`, `file`, `response_format=json`, and
  optional `language`.
- Do not set the multipart `Content-Type` header manually; let `fetch` attach
  the boundary.

#### 4. Validation & Error Matrix

| Condition | Status | Response |
| --- | ---: | --- |
| Missing `OPENAI_API_KEY` | 503 | `{ success: false, code: "missing_openai_api_key" }` |
| Invalid transcription provider URL config | 503 | `{ success: false, code: "invalid_transcription_provider_config" }` |
| Non-multipart request | 400 | `{ success: false, code: "invalid_audio_upload" }` |
| Missing, empty, too-large, or unsupported audio upload | 400/413 | `{ success: false, code: "invalid_audio_upload" }` |
| Invalid language hint | 400 | `{ success: false, code: "invalid_audio_upload" }` |
| Provider request failure | 502 | `{ success: false, code: "transcription_failed" }` |
| Provider response lacks non-empty `text` | 502 | `{ success: false, code: "invalid_transcription_response" }` |
| Provider success | 200 | `{ success: true, text, model }` |

#### 5. Good/Base/Bad Cases

- Good: browser records a short utterance, posts it to the same-origin Worker,
  and receives normalized transcript text without exposing provider secrets.
- Base: `OPENAI_TRANSCRIPTION_MODEL` is unset; the Worker uses `whisper-1`.
- Base: the request supplies `language=zh`; that value is forwarded upstream
  instead of the optional env language.
- Base: a valid `OPENAI_TRANSCRIPTIONS_URL` is enough to route the upstream
  request even when `OPENAI_BASE_URL` is unset or invalid, because base/path is
  not used in full-URL override mode.
- Bad: browser code calls the transcription provider directly with a permanent
  API key.
- Bad: Worker forwards unbounded file uploads or accepts arbitrary non-audio
  files.

#### 6. Tests Required

- Missing key maps to 503.
- Invalid provider URL configuration maps to 503.
- Invalid non-empty `OPENAI_TRANSCRIPTIONS_URL` maps to 503 instead of silently
  falling back to base/path.
- Non-multipart, empty, and unsupported uploads map to `invalid_audio_upload`.
- Mocked provider failure maps to 502 and surfaces provider error text.
- Mocked provider success asserts upstream URL, authorization header, model,
  `response_format=json`, optional language, and file payload.
- Mocked provider response without text maps to
  `invalid_transcription_response`.

#### 7. Wrong vs Correct

Wrong:

```typescript
await fetch("https://api.example/v1/audio/transcriptions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
  },
  body: formData,
});
```

Correct:

```typescript
await fetch("/api/speech/transcription", {
  method: "POST",
  body: formData,
});
```

### 1. Create Operation

```typescript
export const createEntity: MiddlewareHandler<AppEnv> = async (c) => {
  // 1. Validate
  const data = createInputSchema.parse(await c.req.json());

  // 2. Check duplicates
  const existing = await findExisting(db, data);
  if (existing)
    return c.json({ success: false, reason: "Already exists" }, 409);

  // 3. Create
  const [entity] = await db.insert(table).values(data).returning();

  // 4. Log
  logger.info("entity_created", { id: entity.id });

  // 5. Return
  return c.json({ success: true, entity });
};
```

### 2. List with Filters

```typescript
export const listEntities: MiddlewareHandler<AppEnv> = async (c) => {
  const filters = listInputSchema.parse(c.req.query());

  const whereCondition = getEntitiesWhereCondition(filters);

  const entities = await db.query.entities.findMany({
    where: whereCondition,
    limit: filters.limit,
    offset: filters.offset,
    orderBy: (entities, { desc }) => [desc(entities.createdAt)],
  });

  const total = await db.$count(entitiesTable, whereCondition);

  return c.json({
    success: true,
    entities,
    total,
    limit: filters.limit,
    offset: filters.offset,
  });
};
```

### 3. Update with Authorization

```typescript
export const updateEntity: MiddlewareHandler<AppEnv> = async (c) => {
  const data = updateInputSchema.parse(await c.req.json());
  const user = c.get("user");

  // Verify ownership
  const entity = await getEntityWithAuth(db, data.entityId, user!.id);

  // Update
  const [updated] = await db
    .update(entitiesTable)
    .set(data)
    .where(eq(entitiesTable.id, entity.id))
    .returning();

  return c.json({ success: true, entity: updated });
};
```

### 4. Batch Operation

```typescript
export const batchDelete: MiddlewareHandler<AppEnv> = async (c) => {
  const { entityIds } = batchDeleteInputSchema.parse(await c.req.json());
  const user = c.get("user");

  // Fetch and authorize
  const { authorized, unauthorizedIds } = await fetchAuthorizedEntities(
    db,
    entityIds,
    user!.id,
  );

  // Delete in parallel
  const results = await Promise.allSettled(
    authorized.map((entity) =>
      db.delete(entitiesTable).where(eq(entitiesTable.id, entity.id)),
    ),
  );

  const processed = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - processed;

  return c.json({
    success: true,
    total: entityIds.length,
    processed,
    failed,
    unauthorizedIds,
  });
};
```

---

## Anti-Patterns

### Anti-Pattern 1: Fat Procedures

**Problem**: All logic in procedure, hard to test and reuse.

```typescript
// BAD: 200 lines of logic in procedure
export const createOrder = async (c) => {
  const data = createOrderInputSchema.parse(await c.req.json());

  // 50 lines of validation logic
  if (!validateStock(data.items)) { /* ... */ }
  if (!validatePayment(data.payment)) { /* ... */ }
  if (!validateAddress(data.address)) { /* ... */ }

  // 50 lines of calculation logic
  const subtotal = calculateSubtotal(data.items);
  const tax = calculateTax(subtotal, data.address);
  const shipping = calculateShipping(data.items, data.address);

  // 50 lines of database operations
  const order = await db.insert(ordersTable).values(...);
  await db.insert(orderItemsTable).values(...);
  await db.update(productsTable).set(...);

  // 50 lines of notification logic
  await sendEmailToCustomer(...);
  await sendNotificationToWarehouse(...);

  return c.json({ success: true, order });
};
```

**Solution**: Extract to lib/

```typescript
// GOOD: Procedure orchestrates, lib implements
export const createOrder: MiddlewareHandler<AppEnv> = async (c) => {
  const data = createOrderInputSchema.parse(await c.req.json());

  // Validate (extracted)
  await validateOrderData(data);

  // Calculate (extracted)
  const totals = calculateOrderTotals(data);

  // Create (extracted)
  const order = await createOrderWithItems(db, data, totals);

  // Notify (extracted)
  await notifyOrderCreated(order);

  return c.json({ success: true, order });
};
```

### Anti-Pattern 2: Scattered Types

**Problem**: Types defined in multiple files, hard to maintain.

```typescript
// BAD: Types in procedures
// procedures/create.ts
interface CreateWorkspaceInput {
  name: string;
  description?: string;
}

// procedures/update.ts
interface UpdateWorkspaceInput {
  id: string;
  name: string;
}

// procedures/list.ts
interface ListWorkspacesInput {
  limit: number;
  offset: number;
}
```

**Solution**: Centralize in types.ts

```typescript
// GOOD: All types in types.ts
// types.ts
export const createWorkspaceInputSchema = z.object({ ... });
export const updateWorkspaceInputSchema = z.object({ ... });
export const listWorkspacesInputSchema = z.object({ ... });

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceInputSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;
export type ListWorkspacesInput = z.infer<typeof listWorkspacesInputSchema>;
```

### Anti-Pattern 3: Missing Validation

**Problem**: Directly use unvalidated input.

```typescript
// BAD: No validation
export const createWorkspace = async (c) => {
  const body = await c.req.json();
  await db.insert(workspaces).values({
    name: body.name, // What if name is missing?
    description: body.description,
  });
};
```

**Solution**: Always validate with Zod

```typescript
// GOOD: Validate first
export const createWorkspace: MiddlewareHandler<AppEnv> = async (c) => {
  const data = createWorkspaceInputSchema.parse(await c.req.json()); // Throws if invalid

  await db.insert(workspaces).values({
    name: data.name, // Guaranteed valid
    description: data.description, // Type-safe
  });
};
```

---

## Quick Reference

### Response Formats

| Operation | Success Response                                       | Error Response                            |
| --------- | ------------------------------------------------------ | ----------------------------------------- |
| Create    | `{ success: true, entity: {...} }`                     | `{ success: false, reason: "..." }`       |
| Get       | `{ success: true, entity: {...} }`                     | `{ success: false, reason: "Not found" }` |
| List      | `{ success: true, entities: [...], total: N }`         | `{ success: false, reason: "..." }`       |
| Update    | `{ success: true, entity: {...} }`                     | `{ success: false, reason: "..." }`       |
| Delete    | `{ success: true }`                                    | `{ success: false, reason: "..." }`       |
| Batch     | `{ success: true, total: N, processed: N, failed: N }` | `{ success: false, reason: "..." }`       |

### HTTP Status Codes

| Status | Use Case                         |
| ------ | -------------------------------- |
| 200    | Successful operation             |
| 201    | Resource created                 |
| 400    | Invalid input (validation error) |
| 401    | Unauthorized (not logged in)     |
| 403    | Forbidden (no permission)        |
| 404    | Resource not found               |
| 409    | Conflict (duplicate)             |
| 500    | Internal server error            |
