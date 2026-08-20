import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <label className="inline-flex cursor-pointer items-center">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className="peer sr-only"
        {...props}
      />
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded border border-input bg-white transition-colors",
          "peer-checked:border-primary peer-checked:bg-primary",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-1",
          className
        )}
      >
        {checked && <Check className="h-3 w-3 text-primary-foreground" strokeWidth={3} />}
      </span>
    </label>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
