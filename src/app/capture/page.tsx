import { CaptureForm } from "@/components/CaptureForm";
import Link from "next/link";

export const runtime = "edge";

export default function CapturePage() {
  return (
    <main className="min-h-screen bg-bg text-fg">
      <header className="border-b border-line px-8 py-6">
        <Link href="/" className="cinematic hover:text-fg">
          ← console
        </Link>
        <div className="mt-4 cinematic">capture</div>
        <h1 className="mt-2 text-2xl font-medium tracking-tight">
          Fire a transmission
        </h1>
        <p className="mt-2 text-sm text-muted max-w-2xl">
          Raw founder signal in. Cinematic content pack out. The bar is
          something happened, not something post-worthy.
        </p>
      </header>
      <section className="px-8 py-8 max-w-2xl">
        <CaptureForm />
      </section>
    </main>
  );
}
