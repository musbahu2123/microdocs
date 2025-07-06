// src/app/page.tsx
// This is the home page where users can create new MicroDocs.
// It now includes a client-side profanity filter and an optional expiration date input.

"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import MarkdownEditor from "@/components/MarkdownEditor";
import { Filter } from "bad-words";

// Initialize the profanity filter
const filter = new Filter();

export default function HomePage() {
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [customSlug, setCustomSlug] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>(""); // <-- NEW: State for expiration date (string for datetime-local)
  const [message, setMessage] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [profanityDetected, setProfanityDetected] = useState<boolean>(false);

  const router = useRouter();

  const checkProfanity = (text: string) => {
    if (filter.isProfane(text)) {
      setProfanityDetected(true);
      setError("Profanity detected! Please remove inappropriate language.");
      return true;
    }
    setProfanityDetected(false);
    setError("");
    return false;
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTitle = e.target.value;
    setTitle(newTitle);
    checkProfanity(newTitle + " " + content);
  };

  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    checkProfanity(title + " " + newContent);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");
    setIsLoading(true);

    if (checkProfanity(title + " " + content)) {
      setIsLoading(false);
      return;
    }

    if (!title.trim() || !content.trim()) {
      setError("Title and content cannot be empty.");
      setIsLoading(false);
      return;
    }

    // --- NEW: Validate expiration date on frontend ---
    let expirationDateToSend: string | undefined = undefined;
    if (expiresAt) {
      const selectedDate = new Date(expiresAt);
      const now = new Date();
      if (selectedDate <= now) {
        setError("Expiration date must be in the future.");
        setIsLoading(false);
        return;
      }
      expirationDateToSend = selectedDate.toISOString(); // Send as ISO string
    }
    // --- END NEW ---

    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          customSlug,
          password,
          expiresAt: expirationDateToSend, // <-- NEW: Include expiresAt in the body
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(data.message || "Note created successfully!");
        router.push(`/notes/${data.slug}`);
      } else {
        if (data.error && data.error.includes("Profanity")) {
          setError(data.error);
        } else {
          setError(data.message || "Failed to create note. Please try again.");
        }
      }
    } catch (err) {
      console.error("Fetch error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const sanitizeSlug = (input: string) => {
    return input
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center
                 bg-[#F5F5F7] p-4 sm:p-8"
    >
      <div
        className="w-full max-w-full lg:max-w-[calc(100vw-8rem)] xl:max-w-[calc(100vw-12rem)] 2xl:max-w-[calc(100vw-16rem)]
                   bg-white p-8 rounded-lg shadow-xl my-4 lg:my-8 space-y-6"
      >
        <h1 className="text-3xl font-bold text-[#1A202C] text-center mb-6">
          Create a New MicroDoc
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title Input */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Title
            </label>
            <input
              type="text"
              id="title"
              className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm
                         focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                         text-gray-800 bg-white
                         ${
                           profanityDetected
                             ? "border-red-400"
                             : "border-[#D1D5DB]"
                         }`}
              value={title}
              onChange={handleTitleChange}
              placeholder="e.g., Meeting Notes - July 5"
              required
              disabled={isLoading}
            />
          </div>

          {/* MarkdownEditor Component for content */}
          <div>
            <label
              htmlFor="markdown-input"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Note Content (Markdown supported)
            </label>
            <MarkdownEditor
              value={content}
              onChange={handleContentChange}
              rows={10}
              disabled={isLoading}
              className={profanityDetected ? "border-red-400" : ""}
            />
          </div>

          {/* Custom Slug Input */}
          <div>
            <label
              htmlFor="customSlug"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Custom URL Slug (Optional)
            </label>
            <input
              type="text"
              id="customSlug"
              className="mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                         focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                         text-gray-800 bg-white"
              value={customSlug}
              onChange={(e) => setCustomSlug(sanitizeSlug(e.target.value))}
              placeholder="e.g., my-meeting-notes"
              disabled={isLoading}
            />
          </div>

          {/* Password Input */}
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password (Optional, to protect this note)
            </label>
            <input
              type="password"
              id="password"
              className="mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                         focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                         text-gray-800 bg-white"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Leave blank for public note"
              disabled={isLoading}
            />
          </div>

          {/* Expiration Date Input */}
          <div>
            <label
              htmlFor="expiresAt"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Expires At (Optional)
            </label>
            <input
              type="datetime-local"
              id="expiresAt"
              className="mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                         focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                         text-gray-800 bg-white"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)} // Set min to current datetime for future dates
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500">
              Note will automatically become inaccessible after this date and
              time.
            </p>
          </div>

          {/* Submission Button */}
          <button
            type="submit"
            className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm
                       text-sm font-medium text-white bg-[#7F56D9] hover:bg-[#6A4BBA]
                       focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7F56D9]
                       transition duration-150 ease-in-out
                       disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || profanityDetected}
          >
            {isLoading ? (
              <span className="flex items-center justify-center">
                <svg
                  className="animate-spin h-5 w-5 mr-3 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Creating Note...
              </span>
            ) : (
              "Create MicroDoc"
            )}
          </button>
        </form>

        {/* Messages */}
        {message && (
          <p className="mt-4 text-center bg-[#D4EDDA] border border-[#C3E6CB] text-[#155724] px-4 py-3 rounded-md">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 text-center bg-[#F8D7DA] border border-[#F5C6CB] text-[#721C24] px-4 py-3 rounded-md">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
