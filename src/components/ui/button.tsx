import * as React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    const variantStyles = {
      default: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 active:bg-zinc-300 shadow-sm",
      destructive: "bg-red-500/10 text-red-400 hover:bg-red-500/20 active:bg-red-500/30 border border-red-500/20",
      outline: "border border-zinc-800 bg-transparent text-zinc-200 hover:bg-zinc-800 hover:text-zinc-50 active:bg-zinc-700/60",
      secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 active:bg-zinc-600 border border-zinc-700/40",
      ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 active:bg-zinc-800",
      link: "text-blue-400 underline-offset-4 hover:underline p-0 h-auto",
    };

    const sizeStyles = {
      default: "h-9 px-4 py-2 text-xs",
      sm: "h-8 px-3 text-xs rounded-md",
      lg: "h-10 px-6 text-sm rounded-md",
      icon: "h-8 w-8 p-0 rounded-md",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-400",
          "disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
