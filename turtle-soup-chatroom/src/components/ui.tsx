import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function SelectField<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = ""
}: {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const listboxId = useId();
  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!isOpen) return;
    function closeOnOutsideClick(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <span className={`ui-select ${isOpen ? "ui-select-open" : ""} ${className}`.trim()} ref={rootRef}>
      <button
        className="ui-select-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>{selectedOption?.label}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <span className="ui-select-menu" id={listboxId} role="listbox">
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <button
                className={`ui-select-option ${isSelected ? "ui-select-option-active" : ""}`}
                type="button"
                role="option"
                aria-selected={isSelected}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {isSelected && <Check size={15} aria-hidden="true" />}
                <span>{option.label}</span>
              </button>
            );
          })}
        </span>
      )}
    </span>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false
}: {
  value: T;
  options: Array<SelectOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="segmented-control" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            className={`segmented-option ${isActive ? "segmented-option-active" : ""}`}
            type="button"
            role="radio"
            aria-checked={isActive}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            key={option.value}
          >
            {isActive && <Check size={15} aria-hidden="true" />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
