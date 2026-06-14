import { describe, expect, it } from "vitest";

import assistantWorkspaceSource from "@/modules/assistant/components/assistant-workspace.tsx?raw";
import speechAdapterTestSource from "@/modules/assistant/hooks/use-browser-speech-adapter.test.ts?raw";
import speechAdapterSource from "@/modules/assistant/hooks/use-browser-speech-adapter.ts?raw";
import chatCompletionSource from "@/modules/assistant/hooks/use-chat-completion.ts?raw";

const localizedSources = [
  {
    path: "app/modules/assistant/components/assistant-workspace.tsx",
    source: assistantWorkspaceSource,
  },
  {
    path: "app/modules/assistant/hooks/use-browser-speech-adapter.ts",
    source: speechAdapterSource,
  },
  {
    path: "app/modules/assistant/hooks/use-chat-completion.ts",
    source: chatCompletionSource,
  },
  {
    path: "app/modules/assistant/hooks/use-browser-speech-adapter.test.ts",
    source: speechAdapterTestSource,
  },
] as const;

describe("localized source text", () => {
  it("does not contain question-mark replacement text", () => {
    for (const localizedSource of localizedSources) {
      expect(
        localizedSource.source,
        `${localizedSource.path} contains likely corrupted localized text`,
      ).not.toMatch(/\?{3,}/);
    }
  });
});
