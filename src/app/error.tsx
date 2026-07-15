"use client";

/**
 * Root error boundary.
 *
 * Why this matters for playback: if a route throws during CLIENT-SIDE
 * navigation, Next.js would otherwise fall back to a HARD page reload, which
 * destroys the persistent <audio> element and stops the music. By catching the
 * error here, we keep the app as a single-page app (audio keeps playing) and
 * offer a retry instead.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-dvh grid place-items-center px-6 text-center">
      <div className="max-w-md">
        <h2 className="text-xl font-bold mb-2">Something went wrong</h2>
        <p className="text-textdim text-sm mb-5">
          The page couldn’t load, but your music is still playing. You can try
          again.
        </p>
        <pre className="text-[11px] text-textfaint bg-white/5 rounded-lg p-3 mb-5 overflow-auto text-left max-h-32">
          {error.message || "Unknown error"}
        </pre>
        <button
          onClick={reset}
          className="bg-accent text-black font-semibold text-sm px-5 py-2.5 rounded-full hover:scale-105 transition"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
