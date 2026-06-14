# Hook Guidelines

> Complete guide for custom React hooks in a Cloudflare Workers + React Router v7 application with React Query (TanStack Query).

---

## Naming Conventions

Follow the `use{Feature}{Action}` pattern:

| Hook Name | Purpose |
|-----------|---------|
| `useItems` | Fetch a list of items |
| `useItem` | Fetch a single item by ID |
| `useCreateItem` | Create a new item (mutation) |
| `useUpdateItem` | Update an existing item (mutation) |
| `useDeleteItem` | Delete an item (mutation) |
| `useUserProfile` | Fetch current user's profile |
| `useCreateProject` | Create a new project (mutation) |
| `useInfiniteItems` | Paginated/infinite list of items |
| `useDashboardStats` | Fetch dashboard statistics |

**Rules:**

- Prefix with `use` (React convention)
- Feature name comes first (`Item`, `User`, `Project`)
- Action comes last (`Create`, `Update`, `Delete`)
- Query hooks (read) omit the action: `useItems`, `useItem`
- Mutation hooks (write) include the action: `useCreateItem`, `useUpdateItem`

---

## Query Hook Pattern

@@@section:query-hook

### Basic Query Hook

```typescript
import { useQuery } from "@tanstack/react-query";
import type { ListItemsOutput } from "../../server/routes/{feature}/types";

export function useItems() {
  return useQuery({
    queryKey: ["items"],
    queryFn: async (): Promise<ListItemsOutput> => {
      const response = await fetch("/api/items");
      if (!response.ok) {
        throw new Error(`Failed to fetch items: ${response.status}`);
      }
      return (await response.json()) as ListItemsOutput;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### Parameterized Query Hook

```typescript
import { useQuery } from "@tanstack/react-query";
import type { ItemDetail } from "../../server/routes/{feature}/types";

export function useItem(itemId: string | undefined) {
  return useQuery({
    queryKey: ["items", itemId],
    queryFn: async (): Promise<ItemDetail> => {
      const response = await fetch(`/api/items/${itemId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch item: ${response.status}`);
      }
      return (await response.json()) as ItemDetail;
    },
    // Only fetch when itemId is available
    enabled: !!itemId,
    staleTime: 5 * 60 * 1000,
  });
}
```

### Query Key Conventions

Use a consistent, hierarchical key structure:

```typescript
// List queries
queryKey: ["items"]
queryKey: ["items", { status: "active", page: 1 }]

// Detail queries
queryKey: ["items", itemId]
queryKey: ["items", itemId, "comments"]

// User-scoped queries
queryKey: ["users", userId, "projects"]

// Dashboard / aggregate queries
queryKey: ["dashboard", "stats"]
```

**Rules:**

- First element is the resource name (plural)
- Second element is the ID (for detail queries) or filter object (for list queries)
- Nested resources append additional path segments
- Filter objects should be serializable and stable (avoid inline object creation)

### staleTime Guidelines

| Data Type | staleTime | Rationale |
|-----------|-----------|-----------|
| User session | `Infinity` | Managed by auth provider |
| Dashboard stats | `30 * 1000` (30s) | Frequently changing aggregate data |
| List data | `5 * 60 * 1000` (5min) | Moderate change frequency |
| Detail data | `5 * 60 * 1000` (5min) | Moderate change frequency |
| Static config | `60 * 60 * 1000` (1hr) | Rarely changes |

@@@/section:query-hook

---

## Mutation Hook Pattern

@@@section:mutation-hook

### Basic Mutation Hook

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CreateItemInput, ItemDetail } from "../../server/routes/{feature}/types";

export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateItemInput): Promise<ItemDetail> => {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Failed to create item");
      }
      return (await response.json()) as ItemDetail;
    },
    onSuccess: () => {
      // Invalidate the items list so it refetches
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
```

### Update Mutation with Optimistic Updates

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { UpdateItemInput, ItemDetail } from "../../server/routes/{feature}/types";

export function useUpdateItem(itemId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateItemInput): Promise<ItemDetail> => {
      const response = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Failed to update item");
      }
      return (await response.json()) as ItemDetail;
    },

    // Optimistic update: update cache immediately before server responds
    onMutate: async (newData) => {
      // Cancel outgoing refetches to avoid overwriting our optimistic update
      await queryClient.cancelQueries({ queryKey: ["items", itemId] });

      // Snapshot the previous value
      const previousItem = queryClient.getQueryData<ItemDetail>(["items", itemId]);

      // Optimistically update the cache
      if (previousItem) {
        queryClient.setQueryData<ItemDetail>(["items", itemId], {
          ...previousItem,
          ...newData,
        });
      }

      // Return context with the snapshot for rollback
      return { previousItem };
    },

    // On error, roll back to the previous value
    onError: (_error, _newData, context) => {
      if (context?.previousItem) {
        queryClient.setQueryData(["items", itemId], context.previousItem);
      }
    },

    // After success or error, refetch to ensure server state is in sync
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["items", itemId] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
```

### Delete Mutation

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useDeleteItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (itemId: string): Promise<void> => {
      const response = await fetch(`/api/items/${itemId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error("Failed to delete item");
      }
    },
    onSuccess: (_data, itemId) => {
      // Remove the item from detail cache
      queryClient.removeQueries({ queryKey: ["items", itemId] });
      // Invalidate the list
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });
}
```

### Mutation Usage in Components

```tsx
import { useCreateItem } from "@/modules/items/hooks/use-create-item";
import { toast } from "sonner";

function CreateItemForm() {
  const createItem = useCreateItem();

  const handleSubmit = (formData: CreateItemInput) => {
    createItem.mutate(formData, {
      onSuccess: (newItem) => {
        toast.success("Item created successfully");
        navigate(`/items/${newItem.id}`);
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* form fields */}
      <button type="submit" disabled={createItem.isPending}>
        {createItem.isPending ? "Creating..." : "Create Item"}
      </button>
    </form>
  );
}
```

@@@/section:mutation-hook

---

## Custom Hook Composition

Combine query and mutation hooks into a higher-level hook when a component needs both:

```typescript
import { useItem } from "./use-item";
import { useUpdateItem } from "./use-update-item";
import { useDeleteItem } from "./use-delete-item";

export function useItemActions(itemId: string) {
  const query = useItem(itemId);
  const updateMutation = useUpdateItem(itemId);
  const deleteMutation = useDeleteItem();

  return {
    // Query data
    item: query.data,
    isLoading: query.isLoading,
    error: query.error,

    // Mutations
    updateItem: updateMutation.mutate,
    isUpdating: updateMutation.isPending,

    deleteItem: () => deleteMutation.mutate(itemId),
    isDeleting: deleteMutation.isPending,
  };
}
```

**When to compose:**

- A component needs the same entity's query + mutation(s)
- You want to simplify the component's interface
- Multiple components need the same combination

**When NOT to compose:**

- Only a query or only a mutation is needed
- The composition adds no clarity (just wrapping for the sake of it)

---

## Error Handling in Hooks

### Error Boundaries

Wrap major sections in error boundaries so a failed query does not crash the entire page:

```tsx
import { ErrorBoundary } from "react-error-boundary";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";

function ItemsPageWrapper() {
  const { reset } = useQueryErrorResetBoundary();

  return (
    <ErrorBoundary
      onReset={reset}
      fallbackRender={({ resetErrorBoundary }) => (
        <div className="p-8 text-center">
          <p className="text-red-600 mb-4">Failed to load items.</p>
          <button onClick={resetErrorBoundary}>Try Again</button>
        </div>
      )}
    >
      <ItemsList />
    </ErrorBoundary>
  );
}
```

### Toast Notifications for Mutations

Use toast notifications for mutation results:

```typescript
export function useCreateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateItemInput) => {
      // ... fetch logic
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
      toast.success("Item created successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to create item");
    },
  });
}
```

### Error Response Typing

Always type error responses from the API:

```typescript
interface ApiError {
  error: string;
  details?: string;
  statusCode: number;
}

async function handleApiError(response: Response): Promise<never> {
  const body = (await response.json()) as ApiError;
  throw new Error(body.error || `Request failed with status ${response.status}`);
}
```

---

## Cache Invalidation Strategies

### Strategy 1: Invalidate Related Queries

The simplest and most reliable approach. After a mutation, invalidate all queries that might be affected:

```typescript
onSuccess: () => {
  // Invalidate the list (will refetch)
  queryClient.invalidateQueries({ queryKey: ["items"] });
  // Invalidate the specific item detail
  queryClient.invalidateQueries({ queryKey: ["items", itemId] });
}
```

### Strategy 2: Direct Cache Update with setQueryData

For immediate UI updates without a network round-trip:

```typescript
onSuccess: (updatedItem: ItemDetail) => {
  // Update the detail cache directly
  queryClient.setQueryData(["items", updatedItem.id], updatedItem);

  // Update the item within the list cache
  queryClient.setQueryData<ListItemsOutput>(["items"], (old) => {
    if (!old) return old;
    return {
      ...old,
      items: old.items.map((item) =>
        item.id === updatedItem.id ? updatedItem : item
      ),
    };
  });
}
```

### Strategy 3: Optimistic Update + Rollback

For the best perceived performance (see the Update Mutation example above).

### When to Use Each Strategy

| Strategy | Use When |
|----------|----------|
| **Invalidate** | Default choice; simple and correct |
| **setQueryData** | You have the full updated object from the server response |
| **Optimistic** | Low-latency UX is critical (e.g., toggling a favorite, reordering) |

---

## Pagination Hooks

### useInfiniteQuery Pattern

For infinite scroll or "Load More" pagination:

```typescript
import { useInfiniteQuery } from "@tanstack/react-query";

interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useInfiniteItems() {
  return useInfiniteQuery({
    queryKey: ["items", "infinite"],
    queryFn: async ({ pageParam }): Promise<PaginatedResponse<Item>> => {
      const url = new URL("/api/items", window.location.origin);
      url.searchParams.set("limit", "20");
      if (pageParam) {
        url.searchParams.set("cursor", pageParam);
      }

      const response = await fetch(url.toString());
      if (!response.ok) throw new Error("Failed to fetch items");
      return (await response.json()) as PaginatedResponse<Item>;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    staleTime: 5 * 60 * 1000,
  });
}
```

### Usage in Component

```tsx
function InfiniteItemsList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteItems();

  if (isLoading) return <Skeleton />;

  const allItems = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      {allItems.map((item) => (
        <ItemCard key={item.id} item={item} />
      ))}

      {hasNextPage && (
        <button
          onClick={() => fetchNextPage()}
          disabled={isFetchingNextPage}
        >
          {isFetchingNextPage ? "Loading more..." : "Load More"}
        </button>
      )}
    </div>
  );
}
```

### Offset-Based Pagination Hook

For traditional page-number pagination:

```typescript
import { useQuery, keepPreviousData } from "@tanstack/react-query";

export function usePaginatedItems(page: number, pageSize: number = 20) {
  return useQuery({
    queryKey: ["items", { page, pageSize }],
    queryFn: async () => {
      const response = await fetch(
        `/api/items?page=${page}&pageSize=${pageSize}`
      );
      if (!response.ok) throw new Error("Failed to fetch items");
      return (await response.json()) as {
        items: Item[];
        totalCount: number;
        totalPages: number;
      };
    },
    // Keep showing previous page data while the next page loads
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });
}
```

---

## Auth-Aware Hooks

Hooks that depend on the current user's authentication status:

```typescript
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

export function useUserProjects() {
  const { data: session } = authClient.useSession();

  return useQuery({
    queryKey: ["users", session?.user.id, "projects"],
    queryFn: async () => {
      const response = await fetch("/api/projects", {
        credentials: "include", // Send session cookies
      });
      if (!response.ok) throw new Error("Failed to fetch projects");
      return (await response.json()) as { projects: Project[] };
    },
    // Only fetch when user is authenticated
    enabled: !!session?.user.id,
    staleTime: 5 * 60 * 1000,
  });
}
```

### Session-Dependent Cache Keys

Include the user ID in cache keys for user-scoped data to prevent cross-user cache leaks:

```typescript
// Good - cache is scoped to the user
queryKey: ["users", session?.user.id, "notifications"]

// Bad - all users share the same cache entry
queryKey: ["notifications"]
```

### Invalidate on Auth Change

When the session changes (login/logout), invalidate all user-scoped caches:

```tsx
// In your AuthProvider or root layout
<AuthUIProvider
  onSessionChange={() => {
    queryClient.invalidateQueries();
    // Or more targeted:
    // queryClient.invalidateQueries({ queryKey: ["users"] });
  }}
/>
```

---

## Scenario: Browser Chat Completions Compatibility Hooks

### 1. Scope / Trigger

- Trigger: adding or changing browser hooks that call a Worker-backed ordinary
  Chat Completions provider.
- This mode is for broad third-party API compatibility and must not assume
  Realtime/WebRTC support.

### 2. Signatures

- Provider config hook: `app/modules/assistant/hooks/use-provider-config.ts`
- Chat mutation hook: `app/modules/assistant/hooks/use-chat-completion.ts`
- Browser speech adapter hook:
  `app/modules/assistant/hooks/use-browser-speech-adapter.ts`
- Config API: `GET /api/provider/config`
- Completion API: `POST /api/chat/completion`

```typescript
type ProviderMode = "chat" | "realtime";

type SendChatCompletionInput = {
  message: string;
  imageDataUrl?: string;
  responseBudget: "brief" | "standard" | "detailed";
  instructions?: string;
};

type BrowserSpeechAdapterState = {
  isRecognitionSupported: boolean;
  isSynthesisSupported: boolean;
  recognitionStatus: "unsupported" | "idle" | "listening" | "error";
  recognitionError?: string;
  isSpeaking: boolean;
};
```

### 3. Contracts

- The browser must call same-origin Worker endpoints only.
- Permanent provider keys, provider base URLs, and model routing values must
  never be exposed through frontend settings, `VITE_*`, localStorage, or URLs.
  This includes `OPENAI_API_KEY` and transcription-specific keys such as
  `OPENAI_TRANSCRIPTION_API_KEY`.
- `useProviderConfig` may expose only safe non-secret defaults such as
  `providerMode`.
- Chat mode does not require a Realtime session, data channel, or WebRTC peer
  connection.
- Typed messages in Chat mode call `/api/chat/completion` directly.
- Visual questions in Chat mode capture one JPEG frame and send it as
  `imageDataUrl` with the user message.
- The Worker may omit that `imageDataUrl` from the upstream provider payload
  when `OPENAI_CHAT_VISION_INPUT=disabled`; the frontend request contract stays
  unchanged.
- Chat mode may use browser Web Speech APIs as a progressive enhancement:
  speech recognition fills the existing text composer, and speech synthesis
  reads returned text answers locally.
- Chat-mode browser speech recognition does not require an active Realtime
  session or an already-captured application `MediaStream`; the browser may ask
  for microphone permission through its own Web Speech UI.
- Chat-mode speech recognition must not send raw microphone audio to the
  Worker, provider, or Chat Completions model.
- Chat-mode speech synthesis must not be represented as provider audio output;
  it reads the text answer already returned by `/api/chat/completion`.
- Browser speech controls must be feature-detected and show disabled or
  explanatory states when unsupported.
- Switching from Chat mode to Realtime should stop active browser dictation and
  cancel browser speech synthesis so Realtime owns microphone/audio behavior.

### 4. Validation & Error Matrix

| Condition | Expected handling |
| --- | --- |
| Provider config fetch fails | Keep default `chat` mode and surface a non-blocking error. |
| Missing Worker key or chat model | Surface the Worker error in the transcript/error banner. |
| Chat request is in flight | Disable duplicate text/frame sends until it completes. |
| Chat success | Append assistant text to the transcript and return to ready/idle. |
| Chat success response is non-JSON or invalid shape | Show a localized contract error that hints the user may be on the Vite preview URL instead of the Worker URL. Do not surface raw `Unexpected token '<'` JSON parser text. |
| Chat failure | Move to error phase and keep media preview usable. |
| User switches from Realtime to Chat while connected | Stop the Realtime connection before switching modes. |
| Browser speech recognition unsupported | Disable Chat voice input or show an explanatory unsupported state. |
| Browser speech recognition fails | Surface a localized status/error message, explain browser-service network failures, and keep typed Chat input usable. |
| Browser speech synthesis unsupported | Disable Chat answer auto-read without blocking text answers. |
| User switches from Chat to Realtime while dictating or speaking | Stop dictation and cancel browser speech synthesis before switching modes. |

### 5. Good/Base/Bad Cases

- Good: user opens the app with `OPENAI_PROVIDER_MODE=chat`, grants media, and
  asks a camera-frame question without starting a Realtime session.
- Good: supported browser dictation fills the existing Chat text composer; the
  user sends the recognized text through the normal Chat request path.
- Base: typed Chat input works without camera/microphone authorization from the
  app-level media preview.
- Good: optional Chat answer reading uses browser `speechSynthesis` after the
  text answer has been appended to the transcript.
- Base: user sends typed text with no media permission; Chat mode still works
  for text-only providers.
- Bad: Chat mode prompts the user to start a Realtime session before sending
  text.
- Bad: Chat mode streams raw microphone audio to the Worker or model under the
  Chat Completions route.
- Bad: browser speech synthesis is counted or displayed as model-generated
  audio output tokens.

### 6. Tests Required

- Worker route tests cover the API contract; frontend typecheck must verify the
  hooks consume backend response types through type-only imports.
- Browser speech adapter helpers should have unit tests for support detection,
  final transcript extraction, and localized recognition error mapping.
- Manual browser smoke test should cover mode switching, text submit in Chat
  mode, one visual question with media permission, browser dictation where
  supported, and answer auto-read where supported.

### 7. Wrong vs Correct

Wrong:

```typescript
// Sends raw microphone audio through a Chat Completions path.
await fetch("/api/chat/completion", {
  method: "POST",
  body: JSON.stringify({ audioBlob }),
});
```

Correct:

```typescript
// Browser speech recognition produces text; the existing Chat contract stays unchanged.
await sendChatCompletion({
  message: recognizedText,
  responseBudget: "brief",
});
```

## Scenario: Worker-Backed Chat Voice Transcription Hook

### 1. Scope / Trigger

- Trigger: adding or changing browser hooks that record short microphone
  utterances for Chat mode and send them to a Worker-backed transcription API.
- This is the reliable Chat voice path when browser Web Speech recognition or
  Realtime/WebRTC provider support is unavailable.

### 2. Signatures

- Hook location:
  `app/modules/assistant/hooks/use-worker-speech-transcription.ts`
- Transcription API: `POST /api/speech/transcription`
- Hook input:

```typescript
type UseWorkerSpeechTranscriptionInput = {
  stream: MediaStream | null;
  language?: string;
  onStatusMessage: (message: string) => void;
};
```

- Hook result:

```typescript
type WorkerSpeechTranscriptionStatus =
  | "unsupported"
  | "idle"
  | "recording"
  | "transcribing"
  | "error";

type UseWorkerSpeechTranscriptionResult = {
  transcriptionState: {
    isRecordingSupported: boolean;
    status: WorkerSpeechTranscriptionStatus;
    errorMessage?: string;
  };
  startRecording: () => boolean;
  stopRecording: () => Promise<SpeechTranscriptionSuccessResponse | null>;
  cancelRecording: () => void;
};
```

### 3. Contracts

- Feature-detect `MediaRecorder`; unsupported browsers must keep keyboard Chat
  input usable and show a localized explanatory state.
- Use the existing app `MediaStream` and record only the audio track. Do not
  stop the underlying track when creating an audio-only recording stream.
- Pick the first supported MIME type from a small ordered list; if the browser
  supports `MediaRecorder` but not `isTypeSupported`, allow the default
  recorder type.
- Send same-origin `multipart/form-data` to `/api/speech/transcription` with:
  `audio` file and optional `language`.
- Do not set `Content-Type` manually for multipart requests.
- The hook returns normalized Worker responses; the component decides whether
  to auto-send transcript text to Chat or fill the composer for review.
- Continuous Chat voice loops belong in the component layer, not the Worker
  contract: record one short utterance, stop on local silence/max-duration,
  transcribe, send text through the existing Chat request, optionally await
  local browser speech synthesis, then start the next recording only if the
  user has not stopped the loop.
- Continuous mode must expose an explicit stop control that cancels pending
  restart timers and active local recording without stopping the camera stream.
- Do not start the next continuous recording while transcription, Chat
  completion, or local answer speech synthesis is still active; otherwise the
  app can record its own spoken answer as the next user prompt.
- Permanent provider keys, base URLs, and model IDs must never be exposed in
  frontend state, `VITE_*`, localStorage, or query parameters.
- Switching away from Chat mode or releasing media should cancel active
  recording.

### 4. Validation & Error Matrix

| Condition | Expected handling |
| --- | --- |
| No `MediaRecorder` | Status `unsupported`; voice button disabled or explanatory |
| No audio track | Status `error`; ask user to authorize microphone |
| Recording start throws | Status `error`; show microphone permission/start failure |
| Recording stops with no chunks | Status `error`; ask user to retry |
| Worker returns a typed API error | Localize message and keep typed Chat usable |
| Worker returns 503 `missing_openai_api_key` | Tell the user the Worker needs `OPENAI_TRANSCRIPTION_API_KEY` or fallback `OPENAI_API_KEY`; do not suggest a browser-side key setting |
| Worker returns non-JSON or invalid success shape | Show a localized transcription contract error that hints the user may be on the Vite preview URL instead of the Worker URL. Do not surface raw `Unexpected token '<'` JSON parser text. |
| Transcription succeeds | Return `{ success: true, text, model }` to the component |
| Continuous mode is stopped mid-recording | Cancel local recording and do not submit a partial turn |
| Continuous mode is stopped during transcription or Chat response | Finish safe cleanup but do not schedule another recording |
| Browser speech synthesis is active in continuous mode | Wait for `onend` or cancellation before starting the next recording |

### 5. Good/Base/Bad Cases

- Good: user grants media, records a short question, Worker transcribes it, and
  the component auto-sends the recognized text through `/api/chat/completion`.
- Good: review mode inserts transcript text into the existing composer without
  spending Chat tokens until the user sends.
- Good: continuous mode auto-sends one transcribed utterance, speaks the answer
  locally where supported, and only then records the next utterance.
- Base: typed Chat remains available when recording is unsupported or
  transcription fails.
- Base: transcription can use a dedicated Worker secret
  `OPENAI_TRANSCRIPTION_API_KEY`, falling back to `OPENAI_API_KEY`.
- Bad: the component sends raw audio to `/api/chat/completion`.
- Bad: the browser calls the upstream transcription provider directly or embeds
  provider routing in frontend code.
- Bad: a continuous voice loop restarts recording immediately after scheduling
  answer speech, causing the browser to capture the assistant's own spoken
  response.

### 6. Tests Required

- Helper tests cover MIME type selection and upload file extension mapping.
- Helper tests cover localized API error messages.
- Worker route tests cover the server-side transcription contract.
- Typecheck must verify frontend imports backend response types through
  type-only imports.
- Manual browser smoke test should cover auto-send mode, review mode,
  continuous mode start/stop, microphone permission failure, and typed Chat
  fallback.

### 7. Wrong vs Correct

Wrong:

```typescript
await fetch("/api/chat/completion", {
  method: "POST",
  body: JSON.stringify({ audioBlob }),
});
```

Correct:

```typescript
const transcription = await stopRecording();
if (transcription !== null) {
  await sendChatCompletion({
    message: transcription.text,
    responseBudget: "standard",
  });
}
```

---

## Scenario: Browser Realtime WebRTC Session Hook

### 1. Scope / Trigger

- Trigger: adding or changing a browser hook that connects to OpenAI Realtime
  through a Worker-issued short-lived session.
- This is a cross-layer contract: browser media capture, Worker session
  creation, OpenAI SDP exchange, and data-channel visual context must stay in
  sync.

### 2. Signatures

- Hook location: `app/modules/{feature}/hooks/use-realtime-session.ts`
- Session API: `POST /api/realtime/session`
- WebRTC SDP exchange:
  `POST <sessionResponse.webrtcUrl>`
- Hook start input:

```typescript
type StartRealtimeSessionInput = {
  visualContextMode: "manual" | "interval";
  turnDetectionMode: "server-vad" | "push-to-talk";
  responseBudget: "brief" | "standard" | "detailed";
  instructions?: string;
};
```

- Visual context send input:

```typescript
type SendVisualContextInput = {
  frameDataUrl: string;
  prompt: string;
  requestResponse: boolean;
};
```

### 3. Contracts

- The browser must use the same-origin Worker endpoint for session creation;
  permanent `OPENAI_API_KEY` values must never be available through `VITE_*`
  variables or frontend code.
- A successful Worker response must include a session object with
  `client_secret.value` and may include `model`; if `model` is absent, the
  browser falls back to the project Realtime default.
- A successful Worker response must include `webrtcUrl`; browser code must use
  that URL for the WebRTC SDP exchange instead of hardcoding an OpenAI URL.
- A successful Worker response must include a cost policy with
  `responseBudget` and `maxResponseOutputTokens`; the browser validates this
  before continuing with the WebRTC SDP exchange.
- Worker-side Realtime provider configuration lives in runtime bindings only:
  `OPENAI_BASE_URL`, `OPENAI_REALTIME_BASE_URL`,
  `OPENAI_REALTIME_SESSION_PATH`, `OPENAI_REALTIME_WEBRTC_PATH`,
  `OPENAI_REALTIME_SESSION_URL`, `OPENAI_REALTIME_WEBRTC_URL`,
  `OPENAI_REALTIME_MODEL`, and `OPENAI_REALTIME_VOICE`. Do not mirror these as
  frontend secrets.
- The browser sends microphone audio over the `RTCPeerConnection`.
- `turnDetectionMode: "push-to-talk"` disables server VAD in the Worker-created
  session and the browser must keep the local audio track disabled while idle.
- Push-to-talk release sends `input_audio_buffer.commit` followed by
  `response.create` on the Realtime data channel.
- `responseMode: "audio-text"` sends `response.create` with
  `modalities: ["audio", "text"]`; `responseMode: "text-only"` sends
  `modalities: ["text"]`. This response mode must apply consistently to text
  messages, visual frame questions, and push-to-talk releases.
- The browser must keep the 10-minute session hard cap and also run an
  activity-based idle monitor after the Realtime data channel opens. Idle
  policy constants live in `use-realtime-session.ts` and use Unix
  milliseconds: warn after 90 seconds idle, disconnect after 120 seconds idle,
  check every 30 seconds.
- Meaningful Realtime activity must reset the idle warning/disconnect window.
  At minimum this includes speech start, text sends, visual frame sends,
  push-to-talk audio commits, and response completion. Assistant output events
  may also refresh activity so long responses are not interrupted.
- Idle warnings and disconnect notices should use transcript system messages,
  matching the existing session lifecycle surface. Emit only one warning per
  idle window; any later meaningful activity clears the warning state.
- Idle timers must be cleared from every connection close path. Push-to-talk
  hold state counts as ongoing activity so a long hold is not disconnected
  before release.
- Microphone mute uses `MediaStreamTrack.enabled = false` and must not require
  WebRTC renegotiation.
- The browser receives assistant audio from `peerConnection.ontrack` and binds
  the remote stream to an `<audio autoplay>` element.
- The Realtime data channel label is `oai-events`.
- Camera frames are sent as JPEG data URLs in controlled
  `conversation.item.create` events, not as continuous raw video.
- If `requestResponse` is `true`, send `response.create` after the visual
  context item; if `false`, update context without forcing an immediate model
  response.

### 4. Validation & Error Matrix

| Condition | Expected handling |
| --- | --- |
| No media stream | Do not create WebRTC; show a user-visible error. |
| No audio track | Do not create WebRTC; show a microphone-specific error. |
| Browser lacks `RTCPeerConnection` | Do not call the session endpoint; show an unsupported-browser error. |
| Worker returns 503 `missing_openai_api_key` | Surface the configuration error; keep media UI runnable. |
| Worker response lacks `session.client_secret.value` | Close partial peer connection and show a contract error. |
| Worker response lacks `webrtcUrl` | Close partial peer connection and show a contract error. |
| Worker response lacks response budget policy fields | Close partial peer connection and show a contract error. |
| SDP exchange fails | Close partial peer connection and show the upstream error text/status. |
| Data channel is not open | Do not send frames; return `false` from the send function. |
| Push-to-talk is muted or not active | Keep the audio track disabled and do not commit an audio buffer. |
| Idle warning threshold reached | Add a system transcript notice once, keep the connection open. |
| Idle disconnect threshold reached | Add a system transcript notice, close data channel and peer connection, and return the UI to ready/idle state. |
| Realtime server sends `error` event | Surface the message and move the UI to an error state. |

### 5. Good/Base/Bad Cases

- Good: user grants media, Worker returns a valid short-lived session,
  data channel opens, microphone audio streams, and a sampled JPEG frame is sent
  with a response request.
- Good: an active conversation keeps resetting the idle activity timestamp and
  never reaches the idle disconnect threshold.
- Base: no `OPENAI_API_KEY` is configured; camera preview and frame sampling
  still work, while session start reports a 503 configuration error.
- Bad: browser code calls OpenAI session creation with a permanent key or tries
  to stream every video frame continuously.
- Bad: text-only mode is implemented by muting local playback while still
  sending `modalities: ["audio", "text"]`; that hides sound but does not reduce
  output-audio tokens.
- Bad: idle monitoring uses a fixed countdown from session start; active users
  would be disconnected even though the goal is abandoned-session cleanup.

### 6. Tests Required

- Worker route tests must assert missing key maps to 503, invalid body maps to
  400, invalid provider URL configuration maps to 503, upstream failure maps to
  502, and success returns the cost policy plus `webrtcUrl`.
- Worker route tests must cover default OpenAI URL construction, third-party
  base URL construction, and full session/WebRTC URL overrides.
- Worker route tests must cover default server VAD and push-to-talk
  `turn_detection: null` payload mapping.
- Worker route tests must cover response budget defaults and
  `max_response_output_tokens` payload mapping.
- Unit tests should cover response-create event construction for audio+text and
  text-only modalities.
- Unit tests should cover idle decision behavior at warning/disconnect
  thresholds, repeated-warning suppression, and clock edge cases.
- Typecheck must verify the hook consumes backend response types through
  type-only imports.
- Browser smoke/manual tests must cover camera/microphone permission prompts,
  remote audio playback, and frame send controls because these depend on real
  browser hardware permissions.

### 7. Wrong vs Correct

Wrong:

```typescript
// Exposes a permanent key and bypasses the Worker contract.
await fetch("https://api.openai.com/v1/realtime/sessions", {
  headers: {
    Authorization: `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`,
  },
});
```

Correct:

```typescript
const sessionResponse = await fetch("/api/realtime/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ visualContextMode: "manual" }),
});

// Use only the short-lived session.client_secret.value for WebRTC SDP.
```

## Scenario: Realtime Usage Measurement Export

### 1. Scope / Trigger

- Trigger: changing the Realtime usage meter, cost-model helpers, or measurement
  evidence workflow.
- Goal: keep exported measurement evidence tied to authoritative
  `response.done` usage instead of hand-entered UI totals.

### 2. Signatures

```typescript
export type UsageTurn = {
  index: number;
  recordedAt: number;
  usage: UsageBuckets;
  estimatedCostUsd: number;
  cumulativeEstimatedCostUsd: number;
};

export type UsageReport = {
  turnCount: number;
  totals: UsageBuckets;
  lastTurn: UsageBuckets | null;
  estimatedCostUsd: number;
  turns: readonly UsageTurn[];
};

export function appendUsageTurn(
  report: UsageReport,
  turnUsage: UsageBuckets,
  recordedAt: number,
): UsageReport;

export function serializeUsageReportJson(
  report: UsageReport,
  generatedAt?: number,
): string;

export function serializeUsageReportCsv(
  report: UsageReport,
  generatedAt?: number,
): string;
```

### 3. Contracts

- Each `response.done` event with a valid usage payload appends exactly one
  `UsageTurn` and updates cumulative totals.
- `recordedAt` and export `generatedAt` use Unix milliseconds.
- JSON export must include metadata, prices used for estimates, summary,
  totals, last turn, and per-turn rows.
- CSV export must include one row per turn plus a `totals` row, even for an
  empty session.
- Export stays browser-local: do not add backend storage, analytics endpoints,
  or new dependencies for the measurement PR.
- If `OPENAI_API_KEY` is unavailable, do not fabricate A/B results. Ship export
  support and mark measurement table rows as pending live runs.

### 4. Validation & Error Matrix

| Condition | Expected handling |
| --- | --- |
| `response.done` has no usage object | Ignore it and do not increment `turnCount`. |
| Usage fields are missing, negative, or non-finite | Parse missing/invalid bucket values as `0`. |
| Session has no turns | Export valid JSON and CSV with empty `turns` and a zero totals row. |
| Browser has no configured Realtime key | Leave measurement results pending; do not hard-code sample costs. |

### 5. Good/Base/Bad Cases

- Good: a three-turn session exports three `turn` rows, one `totals` row, and
  cumulative estimated cost that matches the usage meter.
- Base: an empty session export still opens in spreadsheet tools and shows all
  expected columns.
- Bad: documentation claims measured savings when the values came from manual
  estimates or an unauthenticated local run.

### 6. Tests Required

- Unit tests for `appendUsageTurn` preserving per-turn usage and cumulative
  totals.
- Unit tests for JSON export metadata, totals, last turn, and empty-session
  behavior.
- Unit tests for CSV header, per-turn rows, totals row, and empty-session
  behavior.
- Existing usage parsing tests must continue to cover invalid and partial
  `response.done` payloads.

### 7. Wrong vs Correct

Wrong:

```typescript
// Only exports the visible summary; loses per-turn evidence needed for A/B.
const report = {
  turns: usageReport.turnCount,
  cost: usageReport.estimatedCostUsd,
};
```

Correct:

```typescript
const csv = serializeUsageReportCsv(usageReport, Date.now());
```

## Scenario: Visual Frame Sampling Cost Gate

### 1. Scope / Trigger

- Trigger: changing browser camera frame sampling, automatic visual context
  uploads, or helper modules under `app/modules/assistant/lib/` that decide
  whether to send a sampled frame.
- Goal: prevent automatic interval sampling from uploading visually redundant
  frames while preserving deterministic manual frame actions.

### 2. Signatures

```typescript
export type FrameSignature = {
  width: number;
  height: number;
  luma: readonly number[];
};

export function createFrameSignatureFromImageData(
  imageData: FrameImageData,
  options?: { width?: number; height?: number },
): FrameSignature;

export function frameDifferenceRatio(
  previous: FrameSignature,
  next: FrameSignature,
): number;

export function shouldSendFrame(
  previous: FrameSignature | null,
  next: FrameSignature,
  threshold?: number,
): boolean;
```

### 3. Contracts

- Keep the default grid small (`32x18`) so the browser-side comparison is cheap
  enough to run on every interval sample.
- Keep the default send threshold at `0.04` unless measurement data justifies a
  different value.
- Automatic interval sampling compares the candidate frame signature with the
  last successfully uploaded frame signature.
- Only update the last uploaded signature after `sendVisualContext` returns
  `true`.
- Manual `Sample frame` and `Ask with frame` actions must bypass the difference
  gate and attempt to send the current frame whenever media/session state allows
  it.
- Low-change automatic frames may update local preview/capture counters, but
  must not send a Realtime `conversation.item.create` event.

### 4. Good/Base/Bad Cases

- Good: a static scene under interval sampling increments the skipped counter
  and keeps image-input token growth flat.
- Base: the first automatic frame in a session sends because no previous
  uploaded signature exists.
- Bad: manual `Ask with frame` is blocked because the frame is visually similar
  to the last automatic upload.

### 5. Tests Required

- Identical signatures produce a `0` difference ratio.
- Small synthetic luma noise below the threshold is skipped.
- Synthetic scene changes above the threshold are sent.
- Incompatible signatures are treated as a send-worthy change.

---

## Summary

| Pattern | When to Use |
|---------|-------------|
| `useQuery` | Read data from API |
| `useMutation` | Create, update, or delete data |
| `useInfiniteQuery` | Paginated lists with "load more" / infinite scroll |
| Optimistic updates | Toggle, reorder, or other instant-feedback actions |
| Cache invalidation | After every successful mutation |
| Auth-aware hooks | User-scoped data that requires authentication |
| Hook composition | When a component needs query + mutation for the same entity |
