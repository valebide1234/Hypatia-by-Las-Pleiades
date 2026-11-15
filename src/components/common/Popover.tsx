import { useEffect, useId, useRef, useState, type ReactNode } from "react";

interface Props {
  /** Renders the trigger; receives the props it must spread onto a <button>. */
  trigger: (p: { "aria-expanded": boolean; "aria-controls": string; onClick: () => void }) => ReactNode;
  children: ReactNode;
  label: string;
  align?: "left" | "right";
  className?: string;
}

/** Minimal accessible popover: toggles on click, closes on outside click or Escape. */
export default function Popover({ trigger, children, label, align = "left", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation(); // don't also close the site panel
          setOpen(false);
          (ref.current?.querySelector("button") as HTMLButtonElement | null)?.focus();
        }
      }}
    >
      {trigger({ "aria-expanded": open, "aria-controls": id, onClick: () => setOpen((o) => !o) })}
      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className={`glass absolute top-full z-30 mt-2 !bg-space-900/95 p-4 ${align === "right" ? "right-0" : "left-0"} ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}
