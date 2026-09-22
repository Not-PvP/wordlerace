"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        Please refresh the page. If the problem continues, head back home and start a new race.
      </p>
      <Link href="/" className="rounded-md bg-foreground px-4 py-2.5 text-sm font-semibold text-white">
        Go home
      </Link>
    </div>
  );
}
