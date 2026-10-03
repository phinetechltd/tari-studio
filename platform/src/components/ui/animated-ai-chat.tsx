"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Command, LoaderIcon, SendIcon } from "lucide-react";
import * as React from "react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The animated AI chat composer (adapted from the 21st.dev "animated-ai-chat").
 *
 * Changes from the original, which was a self-contained demo:
 *   - props-driven: the caller supplies the commands, handles `onSend`, says
 *     when the assistant is thinking, and renders the conversation as children;
 *   - the pointer-following glow is scoped to this component, not the page, and
 *     is skipped under prefers-reduced-motion;
 *   - no module-level <style> injection (the keyframes live in globals.css);
 *   - no fake attachments or timers.
 *
 * It is always dark, in both themes: it is drawn as a showcase band.
 */

interface UseAutoResizeTextareaProps {
  minHeight: number;
  maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = `${minHeight}px`;
      if (reset) return;
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY));
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight],
  );

  useEffect(() => {
    if (textareaRef.current) textareaRef.current.style.height = `${minHeight}px`;
  }, [minHeight]);

  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [adjustHeight]);

  return { textareaRef, adjustHeight };
}

export interface CommandSuggestion {
  icon: React.ReactNode;
  label: string;
  description: string;
  prefix: string;
}

export interface AnimatedAIChatHandle {
  /** Replace the draft (e.g. "/animate ") and focus the composer. */
  setDraft: (text: string) => void;
  focus: () => void;
}

export interface AnimatedAIChatProps {
  commands: CommandSuggestion[];
  /** Called with the trimmed text. Resolve to clear the composer; throw to keep the draft. */
  onSend: (text: string) => Promise<void> | void;
  headline?: string;
  subline?: string;
  placeholder?: string;
  /** Shows the assistant's "thinking" pill. */
  thinking?: boolean;
  thinkingLabel?: string;
  /** Short name shown in the thinking pill. */
  assistantName?: string;
  disabled?: boolean;
  /** The conversation, rendered above the composer. */
  children?: React.ReactNode;
  /** Rendered under the composer (a live quote, a hint). */
  footer?: React.ReactNode;
  /** Hide the command chips under the composer. */
  hideChips?: boolean;
  className?: string;
  /** Called on every keystroke, for live previews. */
  onDraftChange?: (text: string) => void;
}

export const AnimatedAIChat = forwardRef<AnimatedAIChatHandle, AnimatedAIChatProps>(function AnimatedAIChat(
  {
    commands,
    onSend,
    headline,
    subline,
    placeholder = "Describe what you want to make…",
    thinking = false,
    thinkingLabel = "Thinking",
    assistantName = "AI",
    disabled = false,
    children,
    footer,
    hideChips = false,
    className,
    onDraftChange,
  },
  ref,
) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [recentCommand, setRecentCommand] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const [inputFocused, setInputFocused] = useState(false);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({ minHeight: 60, maxHeight: 200 });
  const rootRef = useRef<HTMLDivElement>(null);
  const commandPaletteRef = useRef<HTMLDivElement>(null);
  const commandButtonRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const busy = thinking || sending || disabled;

  const updateValue = useCallback(
    (next: string) => {
      setValue(next);
      onDraftChange?.(next);
    },
    [onDraftChange],
  );

  useImperativeHandle(
    ref,
    () => ({
      setDraft(text: string) {
        updateValue(text);
        requestAnimationFrame(() => {
          adjustHeight();
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(text.length, text.length);
          }
        });
      },
      focus() {
        textareaRef.current?.focus();
      },
    }),
    [adjustHeight, textareaRef, updateValue],
  );

  useEffect(() => {
    if (value.startsWith("/") && !value.includes(" ")) {
      setShowCommandPalette(true);
      setActiveSuggestion(commands.findIndex((cmd) => cmd.prefix.startsWith(value)));
    } else {
      setShowCommandPalette(false);
    }
  }, [value, commands]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        commandPaletteRef.current &&
        !commandPaletteRef.current.contains(target) &&
        !commandButtonRef.current?.contains(target)
      ) {
        setShowCommandPalette(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectCommand = (index: number) => {
    const selected = commands[index];
    if (!selected) return;
    updateValue(selected.prefix + " ");
    setShowCommandPalette(false);
    setRecentCommand(selected.label);
    setTimeout(() => setRecentCommand(null), 2000);
    textareaRef.current?.focus();
  };

  const send = async () => {
    const text = value.trim();
    if (!text || busy) return;
    setSending(true);
    try {
      await onSend(text);
      updateValue("");
      adjustHeight(true);
    } catch {
      // The caller shows its own error; the draft is kept so nothing is lost.
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandPalette && commands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveSuggestion((prev) => (prev < commands.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveSuggestion((prev) => (prev > 0 ? prev - 1 : commands.length - 1));
        return;
      }
      if ((e.key === "Tab" || e.key === "Enter") && activeSuggestion >= 0) {
        e.preventDefault();
        selectCommand(activeSuggestion);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowCommandPalette(false);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduceMotion || !inputFocused) return;
    const box = rootRef.current?.getBoundingClientRect();
    if (box) setPointer({ x: e.clientX - box.left, y: e.clientY - box.top });
  };

  return (
    <div
      ref={rootRef}
      onPointerMove={onPointerMove}
      className={cn(
        "lab-bg relative flex w-full flex-col items-center overflow-hidden bg-neutral-950 text-white",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute left-1/4 top-0 h-96 w-96 animate-pulse rounded-full bg-violet-500/10 blur-[128px]" />
        <div className="absolute bottom-0 right-1/4 h-96 w-96 animate-pulse rounded-full bg-indigo-500/10 blur-[128px] [animation-delay:700ms]" />
        <div className="absolute right-1/3 top-1/4 h-64 w-64 animate-pulse rounded-full bg-fuchsia-500/10 blur-[96px] [animation-delay:1000ms]" />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col gap-6">
        {(headline || subline) && (
          <motion.div
            className="space-y-3 text-center"
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {headline && (
              <div className="inline-block">
                <h2 className="bg-gradient-to-r from-white/90 to-white/50 bg-clip-text pb-1 text-2xl font-medium tracking-tight text-transparent sm:text-3xl">
                  {headline}
                </h2>
                <motion.div
                  className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
                  initial={reduceMotion ? false : { width: 0, opacity: 0 }}
                  animate={{ width: "100%", opacity: 1 }}
                  transition={{ delay: 0.4, duration: 0.8 }}
                />
              </div>
            )}
            {subline && <p className="text-sm text-white/50">{subline}</p>}
          </motion.div>
        )}

        {children}

        <motion.div
          className="relative rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-2xl backdrop-blur-2xl"
          initial={reduceMotion ? false : { scale: 0.98 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <AnimatePresence>
            {showCommandPalette && commands.length > 0 && (
              <motion.div
                ref={commandPaletteRef}
                role="listbox"
                aria-label="Commands"
                className="absolute bottom-full left-4 right-4 z-50 mb-2 overflow-hidden rounded-lg border border-white/10 bg-black/90 shadow-lg backdrop-blur-xl"
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.15 }}
              >
                <div className="bg-black/95 py-1">
                  {commands.map((suggestion, index) => (
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeSuggestion === index}
                      key={suggestion.prefix}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors",
                        activeSuggestion === index ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5",
                      )}
                      onClick={() => selectCommand(index)}
                    >
                      <span className="flex h-5 w-5 items-center justify-center text-white/60">{suggestion.icon}</span>
                      <span className="font-medium">{suggestion.label}</span>
                      <span className="ml-1 text-white/40">{suggestion.prefix}</span>
                      <span className="ml-auto hidden text-white/40 sm:inline">{suggestion.description}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="p-4">
            <label className="sr-only" htmlFor="ai-chat-input">
              Message
            </label>
            <textarea
              id="ai-chat-input"
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                updateValue(e.target.value);
                adjustHeight();
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder={placeholder}
              disabled={disabled}
              className={cn(
                "min-h-[60px] w-full resize-none border-none bg-transparent px-4 py-3 text-sm text-white/90",
                "placeholder:text-white/30 focus:outline-none focus-visible:outline-none disabled:opacity-50",
              )}
              style={{ overflow: "hidden" }}
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-white/[0.06] p-4">
            <div className="flex items-center gap-3">
              <motion.button
                ref={commandButtonRef}
                type="button"
                aria-label="Show commands"
                aria-expanded={showCommandPalette}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCommandPalette((prev) => !prev);
                }}
                whileTap={{ scale: 0.94 }}
                className={cn(
                  "group relative rounded-lg p-2 text-white/50 transition-colors hover:text-white/90",
                  showCommandPalette && "bg-white/10 text-white/90",
                )}
              >
                <Command className="h-4 w-4" />
              </motion.button>
              <AnimatePresence>
                {recentCommand && (
                  <motion.span
                    className="text-xs text-white/50"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {recentCommand}
                  </motion.span>
                )}
              </AnimatePresence>
            </div>

            <motion.button
              type="button"
              onClick={() => void send()}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              disabled={busy || !value.trim()}
              className={cn(
                "flex min-h-[40px] items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                value.trim() && !busy
                  ? "bg-white text-neutral-950 shadow-lg shadow-white/10"
                  : "cursor-not-allowed bg-white/[0.06] text-white/40",
              )}
            >
              {sending || thinking ? (
                <LoaderIcon className="h-4 w-4 animate-[spin_2s_linear_infinite]" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
              <span>Send</span>
            </motion.button>
          </div>
        </motion.div>

        {footer}

        {!hideChips && commands.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {commands.map((suggestion, index) => (
              <motion.button
                type="button"
                key={suggestion.prefix}
                onClick={() => selectCommand(index)}
                className="relative flex min-h-[40px] items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-sm text-white/60 transition-all hover:bg-white/[0.06] hover:text-white/90"
                initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
              >
                {suggestion.icon}
                <span>{suggestion.label}</span>
              </motion.button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {thinking && (
          <motion.div
            role="status"
            className="relative z-10 mx-auto mt-4 rounded-full border border-white/[0.06] bg-white/[0.03] px-4 py-2 shadow-lg backdrop-blur-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-7 min-w-8 items-center justify-center rounded-full bg-white/[0.06] px-2 text-center">
                <span className="text-xs font-medium text-white/90">{assistantName}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/70">
                <span>{thinkingLabel}</span>
                <TypingDots />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {inputFocused && !reduceMotion && (
        <motion.div
          aria-hidden
          className="motion-safe-only pointer-events-none absolute left-0 top-0 z-0 h-[40rem] w-[40rem] rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 opacity-[0.03] blur-[96px]"
          animate={{ x: pointer.x - 320, y: pointer.y - 320 }}
          transition={{ type: "spring", damping: 25, stiffness: 150, mass: 0.5 }}
        />
      )}
    </div>
  );
});

export function TypingDots() {
  return (
    <div className="ml-1 flex items-center" aria-hidden>
      {[1, 2, 3].map((dot) => (
        <motion.div
          key={dot}
          className="mx-0.5 h-1.5 w-1.5 rounded-full bg-white/90"
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
          style={{ boxShadow: "0 0 4px rgba(255, 255, 255, 0.3)" }}
        />
      ))}
    </div>
  );
}
