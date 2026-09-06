import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  filterCommands,
  highlightSegments,
  moveSelection,
} from "@/modules/assistant/lib/command-registry";
import type { CommandAction } from "@/modules/assistant/lib/command-registry";

const GROUP_ORDER: readonly CommandAction["group"][] = [
  "navigation",
  "panels",
  "preferences",
];

export type CommandPaletteProps = {
  /** 是否展开（受控态，由 useCommandPalette 管理）。 */
  open: boolean;
  /** 关闭回调。 */
  onClose: () => void;
  /** 可供执行的命令列表。 */
  commands: readonly CommandAction[];
};

/** 带匹配高亮的分段渲染：把 label 中命中查询的子串用 <mark> 高亮。 */
function HighlightedLabel({
  text,
  query,
}: {
  text: string;
  query: string;
}): React.JSX.Element {
  const segments = useMemo(() => highlightSegments(text, query), [text, query]);
  return (
    <>
      {segments.map((segment, index) =>
        segment.matched ? (
          <mark key={index} className="command-palette__match">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

/**
 * 全局命令面板（Linear/Modern 风格）——受控展示组件。
 *
 * 键盘唤起（`Ctrl/Cmd + K`）与 Esc 由父层 `useCommandPalette` 管理；
 * 本组件负责搜索过滤、分组渲染与列表内 `↑/↓/Enter` 导航。
 * 过滤纯函数在 `lib/command-registry`。
 *
 * 分组高亮增强：
 *  - 输入查询时，命中的命令标题子串以 <mark> 高亮；
 *  - 含当前选中项的分组标签以主色强调，其余保持弱化。
 */
export const CommandPalette = memo(function CommandPalette({
  open,
  onClose,
  commands,
}: CommandPaletteProps): React.JSX.Element | null {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(
    () => filterCommands(commands, query),
    [commands, query],
  );

  // 按分组聚合展示（置于早期返回之前，保证 Hook 调用顺序稳定）。
  const grouped = useMemo(() => {
    const byGroup = new Map<CommandAction["group"], CommandAction[]>();
    for (const command of filtered) {
      const list = byGroup.get(command.group);
      if (list) {
        list.push(command);
      } else {
        byGroup.set(command.group, [command]);
      }
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
      group: g,
      items: byGroup.get(g) ?? [],
    }));
  }, [filtered]);

  // 打开时聚焦输入框、重置选中与查询。
  useEffect(() => {
    if (open) {
      setSelectedIndex(0);
      setQuery("");
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((i) => moveSelection(i, 1, filtered.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((i) => moveSelection(i, -1, filtered.length));
      return;
    }
    if (event.key === "Enter" && filtered.length > 0) {
      event.preventDefault();
      const index = Math.min(filtered.length - 1, Math.max(0, selectedIndex));
      const command = filtered[index];
      if (command) {
        command.action();
        onClose();
      }
    }
  };

  const hasResults = filtered.length > 0;

  return (
    <div
      className="command-palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        // 点击遮罩空白处关闭。
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("commandPalette.title")}
        data-command-palette-open="true"
      >
        <div className="command-palette__search">
          <Search size={16} aria-hidden="true" className="command-palette__search-icon" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t("commandPalette.placeholder")}
            className="command-palette__input"
            aria-label={t("commandPalette.placeholder")}
            data-command-palette-input="true"
          />
          <kbd className="command-palette__kbd">ESC</kbd>
        </div>

        <div
          className="command-palette__list"
          role="listbox"
          aria-label={t("commandPalette.results")}
        >
          {!hasResults ? (
            <div className="command-palette__empty">
              {t("commandPalette.noResults")}
            </div>
          ) : (
            grouped.map(({ group, items }) => {
              const selectedCommand = filtered[selectedIndex];
              const activeGroup =
                selectedCommand !== undefined && selectedCommand.group === group;
              return (
                <div key={group} className="command-palette__group">
                  <div
                    className="command-palette__group-label"
                    data-active={activeGroup || undefined}
                  >
                    <span>{t(`commandPalette.group.${group}`)}</span>
                    {query.trim().length > 0 ? (
                      <span className="command-palette__group-count">
                        {items.length}
                      </span>
                    ) : null}
                  </div>
                  {items.map((command) => {
                    const selected = command.id === selectedCommand?.id;
                    return (
                      <button
                        key={command.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        data-selected={selected || undefined}
                        data-command-id={command.id}
                        className="command-palette__item"
                        onMouseEnter={() =>
                          setSelectedIndex(filtered.findIndex((c) => c.id === command.id))
                        }
                        onClick={() => {
                          command.action();
                          onClose();
                        }}
                      >
                        <span className="command-palette__item-label">
                          <HighlightedLabel
                            text={t(command.labelKey)}
                            query={query}
                          />
                        </span>
                        {command.hintKey ? (
                          <span className="command-palette__item-hint">
                            <HighlightedLabel text={t(command.hintKey)} query={query} />
                          </span>
                        ) : null}
                        {selected ? (
                          <CornerDownLeft
                            size={14}
                            aria-hidden="true"
                            className="command-palette__item-enter"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="command-palette__footer">
          <span className="command-palette__footer-key">
            <kbd>↑</kbd> <kbd>↓</kbd> {t("commandPalette.navigate")}
          </span>
          <span className="command-palette__footer-key">
            <kbd>↵</kbd> {t("commandPalette.select")}
          </span>
          <span className="command-palette__footer-key">
            <kbd>esc</kbd> {t("commandPalette.close")}
          </span>
        </div>
      </div>
    </div>
  );
});
