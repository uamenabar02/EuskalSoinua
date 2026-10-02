"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslation, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { Check, Globe, ChevronDown } from "lucide-react";
import { clsx } from "@/lib/utils";

interface LanguageSelectorProps {
  variant?: "grid" | "compact" | "dropdown";
  className?: string;
}

export default function LanguageSelector({
  variant = "grid",
  className,
}: LanguageSelectorProps) {
  const { locale, setLocale, currentLocaleInfo } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (variant === "compact") {
    return (
      <div className={clsx("flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/10", className)}>
        {SUPPORTED_LOCALES.map((l) => {
          const isActive = locale === l.code;
          return (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer",
                isActive
                  ? "bg-accent text-black shadow-sm font-bold scale-100"
                  : "text-textdim hover:text-white hover:bg-white/5"
              )}
              title={l.englishName}
            >
              <span>{l.flag}</span>
              <span>{l.nativeName}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (variant === "dropdown") {
    return (
      <div className={clsx("relative inline-block text-left", className)} ref={dropdownRef}>
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition cursor-pointer"
          aria-label="Change language"
        >
          <Globe size={14} className="text-accent shrink-0" />
          <span>{currentLocaleInfo.flag}</span>
          <span className="hidden sm:inline">{currentLocaleInfo.nativeName}</span>
          <ChevronDown size={12} className={clsx("text-textdim transition-transform", isOpen && "rotate-180")} />
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-xl bg-bg-soft border border-white/10 shadow-2xl z-50 overflow-hidden py-1 backdrop-blur-xl animate-scale-in">
            {SUPPORTED_LOCALES.map((l) => {
              const isActive = locale === l.code;
              return (
                <button
                  key={l.code}
                  onClick={() => {
                    setLocale(l.code);
                    setIsOpen(false);
                  }}
                  className={clsx(
                    "w-full flex items-center justify-between px-3 py-2 text-xs transition text-left cursor-pointer",
                    isActive ? "bg-accent/15 text-accent font-bold" : "text-white/80 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base leading-none">{l.flag}</span>
                    <div className="flex flex-col">
                      <span>{l.nativeName}</span>
                      <span className="text-[10px] text-textdim font-normal">{l.englishName}</span>
                    </div>
                  </div>
                  {isActive && <Check size={14} className="text-accent" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Default: Grid mode for Settings Page
  return (
    <div className={clsx("grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 pt-1", className)}>
      {SUPPORTED_LOCALES.map((l) => {
        const isSelected = locale === l.code;
        return (
          <button
            key={l.code}
            onClick={() => setLocale(l.code)}
            className={clsx(
              "relative flex flex-col gap-2 rounded-xl p-3.5 border-2 transition text-left bg-white/5 hover:bg-white/10 cursor-pointer",
              isSelected ? "border-accent bg-accent/10 shadow-md" : "border-transparent"
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm text-white">
                <span className="text-lg leading-none">{l.flag}</span>
                <span>{l.nativeName}</span>
              </div>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/10 text-textdim">
                {l.badge}
              </span>
            </div>

            <p className="text-xs text-textdim leading-relaxed">
              {l.description}
            </p>

            {isSelected && (
              <span className="absolute top-2.5 right-2.5 grid place-items-center h-5 w-5 rounded-full bg-accent text-black">
                <Check size={13} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
