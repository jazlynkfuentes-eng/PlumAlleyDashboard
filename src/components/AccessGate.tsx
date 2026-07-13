// src/components/AccessGate.tsx
"use client";
import { useState } from "react";

export default function AccessGate() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await fetch("/api/access/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (res.ok) {
        // Reload to apply cookie
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error || "Invalid code");
      }
    } catch (err) {
      setError("Network error");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
      <form onSubmit={submit} className="flex flex-col items-center gap-4 p-6 bg-[var(--card-bg)] rounded-lg shadow">
        <h2 className="text-2xl font-bold">Enter Access Code</h2>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          className="rounded border p-2"
        />
        <button type="submit" className="btn btn-primary px-4 py-2">
          Submit
        </button>
        {error && <p className="text-[var(--error-text)]">{error}</p>}
      </form>
    </div>
  );
}
