"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";

export type SelectOption = {
  value: string;
  label: string;
  hint?: string;
  badge?: string;
};

export function Select({
  value,
  onChange,
  options,
  label,
  placeholder = "Select…",
  className = "",
  buttonClassName = "",
  fullWidth = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  fullWidth?: boolean;
}) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ query: "", at: 0 });

  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    setActiveIndex(-1);
    if (refocus) buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close(false);
    };
    const onResize = () => close(false);
    // Scrolling the panel's own list must not dismiss it.
    const onScroll = (e: Event) => {
      if (!listRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, close]);

  // Flip above the trigger when the panel would overflow the viewport.
  useLayoutEffect(() => {
    if (!open) return;
    const rect = buttonRef.current?.getBoundingClientRect();
    const panel = listRef.current?.offsetHeight ?? 0;
    if (!rect) return;
    setDropUp(rect.bottom + panel + 16 > window.innerHeight && rect.top > panel + 16);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const commit = (index: number) => {
    const option = options[index];
    if (!option) return;
    onChange(option.value);
    close();
  };

  const openAt = (index: number) => {
    setOpen(true);
    setActiveIndex(index);
  };

  const step = (from: number, delta: number) => {
    const count = options.length;
    if (count === 0) return -1;
    return (from + delta + count) % count;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (open) setActiveIndex((i) => step(i, 1));
        else openAt(Math.max(selectedIndex, 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActiveIndex((i) => step(i < 0 ? 0 : i, -1));
        else openAt(Math.max(selectedIndex, 0));
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(0);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(options.length - 1);
        }
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (open) commit(activeIndex >= 0 ? activeIndex : selectedIndex);
        else openAt(Math.max(selectedIndex, 0));
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      case "Tab":
        if (open) close(false);
        break;
      default: {
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
        const now = Date.now();
        typeahead.current.query = now - typeahead.current.at > 600 ? e.key : typeahead.current.query + e.key;
        typeahead.current.at = now;
        const query = typeahead.current.query.toLowerCase();
        const match = options.findIndex((o) => o.label.toLowerCase().startsWith(query));
        if (match >= 0) {
          e.preventDefault();
          if (open) setActiveIndex(match);
          else commit(match);
        }
      }
    }
  };

  return (
    <div ref={rootRef} className={`relative ${fullWidth ? "w-full" : ""} ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        aria-label={label}
        onClick={() => (open ? close() : openAt(Math.max(selectedIndex, 0)))}
        onKeyDown={onKeyDown}
        className={`group inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm text-text transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
          open
            ? "border-accent/60 bg-panel-raised ring-2 ring-accent/20"
            : "border-border bg-panel-raised/50 hover:border-border-strong hover:bg-panel-raised"
        } ${fullWidth ? "w-full justify-between" : ""} ${buttonClassName}`}
      >
        <span className="truncate font-medium">{selected?.label ?? placeholder}</span>
        <span className="flex shrink-0 items-center gap-2">
          {selected?.badge && (
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-accent">
              {selected.badge}
            </span>
          )}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={`text-text-faint transition-transform duration-200 group-hover:text-text-muted ${
              open ? "rotate-180 text-text-muted" : ""
            }`}
          >
            <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      {open && (
        <div
          ref={listRef}
          id={`${id}-listbox`}
          role="listbox"
          aria-label={label}
          aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          tabIndex={-1}
          className={`absolute left-0 z-50 max-h-72 min-w-full overflow-y-auto overflow-x-hidden rounded-xl border border-border-strong bg-panel/95 p-1.5 shadow-[var(--shadow-2)] backdrop-blur-xl ${
            dropUp ? "bottom-full mb-2 origin-bottom animate-select-up" : "top-full mt-2 origin-top animate-select-down"
          }`}
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            const isActive = index === activeIndex;
            return (
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => commit(index)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-100 ${
                  isActive ? "bg-panel-raised" : ""
                } ${isSelected ? "text-text" : "text-text-muted"}`}
              >
                <span className={`flex w-4 shrink-0 justify-center ${isSelected ? "text-accent" : "text-transparent"}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="m5 13 4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className={`flex-1 truncate ${isSelected ? "font-medium" : ""}`}>{option.label}</span>
                {option.badge && (
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${
                      isSelected ? "bg-accent-soft text-accent" : "bg-bg text-text-faint"
                    }`}
                  >
                    {option.badge}
                  </span>
                )}
                {option.hint && <span className="shrink-0 font-mono text-[11px] text-text-faint">{option.hint}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
