import { cn } from "@/lib/utils";

export function PlumAlleyLogo({
  className,
  size = "md",
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "text-lg tracking-tight",
    md: "text-2xl tracking-tight",
    lg: "text-4xl tracking-tight",
  };

  return (
    <span
      className={cn("inline-flex items-baseline uppercase select-none", sizes[size], className)}
      aria-label="Plum Alley"
    >
      <span className="font-black">Plum</span>
      <span className="font-normal">Alley</span>
    </span>
  );
}
