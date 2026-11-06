// Mark a lesson complete (client button calling /api/progress).
"use client";

import { useState } from "react";

export function MarkCompleteButton({ courseId, lessonId, done }: { courseId: string; lessonId: string; done: boolean }) {
  const [message, setMessage] = useState("");
  const [completed, setCompleted] = useState(done);

  async function mark() {
    const response = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ courseId, lessonId }),
    });
    const data = await response.json();
    if (response.ok) {
      setCompleted(true);
      setMessage("Marked complete.");
    } else {
      setMessage(data.error || "Could not save progress.");
    }
  }

  return (
    <>
      <button
        onClick={() => void mark()}
        disabled={completed}
        style={{ padding: "12px 18px", background: completed ? "#64748b" : "#0f766e", color: "#fff", border: 0, borderRadius: 8, cursor: completed ? "default" : "pointer", fontWeight: 600 }}
      >
        {completed ? "Completed ✓" : "Mark complete"}
      </button>
      {message && <p role="status">{message}</p>}
    </>
  );
}
