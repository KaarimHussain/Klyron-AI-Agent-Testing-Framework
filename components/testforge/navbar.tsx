import Link from "next/link";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";

interface NavbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
}

export function Navbar({ left, right }: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-6xl items-center gap-3 px-4 sm:px-6">
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 shrink-0 group">
          <Image
            src="/Logo.webp"
            alt="Klyron logo"
            width={28}
            height={28}
            className="rounded-md"
          />
          <span className="font-semibold text-sm tracking-tight">
            Klyron <span className="hidden sm:inline font-normal text-muted-foreground">| Testing Agent</span>
          </span>
        </Link>

        {/* Left slot */}
        {left && (
          <>
            <span className="text-border">/</span>
            <div className="min-w-0 flex-1">{left}</div>
          </>
        )}

        <div className="ml-auto flex items-center gap-1">
          {right}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
