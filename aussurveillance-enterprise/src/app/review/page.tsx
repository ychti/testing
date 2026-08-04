import { ReviewQueueConsole } from "@/components/review-queue-console";
import Link from "next/link";

export default function ReviewPage() {
  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.18em] text-cyan-200">
          Human verification queue
        </p>
        <h1 className="text-4xl font-semibold text-white">
          Swipe review for questionable CCTV detections
        </h1>
        <p className="max-w-3xl text-slate-300">
          Upload candidate detections from your standalone surveillance agents,
          verify each location with check/cross actions, and push only approved
          CCTV markers into tenant scoring imports.
        </p>
        <p className="text-sm text-slate-400">
          This queue is designed for human-in-the-loop quality control before
          underwriting analytics in{" "}
          <Link
            href="/customers"
            className="font-semibold text-cyan-200 underline-offset-2 hover:underline"
          >
            Customer Intelligence
          </Link>
          .
        </p>
      </section>

      <ReviewQueueConsole />
    </div>
  );
}
