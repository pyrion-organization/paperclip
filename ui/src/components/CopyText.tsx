import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/classnames";

interface CopyTextProps {
  text: string;
  /** What to display. Defaults to `text`. */
  children?: React.ReactNode;
  containerClassName?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
  /** Tooltip message shown after copying. Default: "Copied!" */
  copiedLabel?: string;
}

export function CopyText({
  text,
  children,
  containerClassName,
  className,
  ariaLabel,
  title,
  copiedLabel = "Copied!",
}: CopyTextProps) {
  const [visible, setVisible] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = copyFailed ? "Copy failed" : copiedLabel;
  const clearTimer = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const copyTextToClipboard = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts (e.g. HTTP on non-localhost)
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        try {
          textarea.select();
          const success = document.execCommand("copy");
          if (!success) throw new Error("execCommand copy failed");
        } finally {
          document.body.removeChild(textarea);
        }
      }
      setCopyFailed(false);
    } catch {
      setCopyFailed(true);
    }
    clearTimer();
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 1500);
  }, [copiedLabel, text]);

  return (
    <span className={cn("relative inline-flex", containerClassName)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        title={title}
        className={cn(
          "cursor-copy hover:text-foreground transition-colors",
          className,
        )}
        onClick={copyTextToClipboard}
      >
        {children ?? text}
      </button>
      <output
        aria-live="polite"
        className={cn(
          "pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 rounded-md bg-foreground text-background px-2 py-1 text-xs whitespace-nowrap transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {label}
      </output>
    </span>
  );
}
