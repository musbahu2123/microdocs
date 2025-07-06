// src/app/notes/[slug]/page.tsx
// This component displays a single MicroDoc note, handling password protection,
// providing navigation links, "Copy Link" button, expiration display,
// and now includes a "Copy Content" button.

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  Lock,
  RotateCw,
  AlertCircle,
  Edit,
  History as HistoryIcon,
  Copy,
  CalendarOff,
} from "lucide-react"; // Import Copy icon

interface NoteData {
  title: string;
  content: string;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // Optional expiration date as ISO string
}

export default function ViewNotePage() {
  const { slug } = useParams();
  const router = useRouter();

  const [note, setNote] = useState<NoteData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [passwordRequired, setPasswordRequired] = useState<boolean>(false);
  const [enteredPassword, setEnteredPassword] = useState<string>("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [attemptingPassword, setAttemptingPassword] = useState<boolean>(false);

  const [copyLinkMessage, setCopyLinkMessage] = useState<string | null>(null); // State for copy link feedback
  const [copyContentMessage, setCopyContentMessage] = useState<string | null>(
    null
  ); // <-- NEW: State for copy content feedback

  const baseAlertClasses =
    "mt-4 text-center px-4 py-3 rounded-md flex items-center justify-center space-x-2";

  const fetchNote = useCallback(
    async (passwordAttempt: string | null = null) => {
      setLoading(true);
      setError(null);
      setPasswordError(null);
      setPasswordRequired(false);

      try {
        let headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        if (passwordAttempt) {
          headers["Authorization"] = `Bearer ${passwordAttempt}`;
        }

        const response = await fetch(`/api/notes/${slug}`, { headers });
        const data = await response.json();

        if (response.ok) {
          setNote(data.note);
          setPasswordRequired(false);
        } else if (
          response.status === 401 &&
          data.message === "Password required."
        ) {
          setPasswordRequired(true);
          setNote(null);
        } else if (
          response.status === 401 &&
          data.message === "Invalid password."
        ) {
          setPasswordRequired(true);
          setPasswordError("Incorrect password. Please try again.");
          setNote(null);
        } else if (
          response.status === 404 &&
          data.message === "Note has expired."
        ) {
          setError("This note has expired and is no longer accessible.");
          setNote(null);
        } else {
          setError(
            data.message || `Failed to fetch note: ${response.statusText}`
          );
          setNote(null);
        }
      } catch (err: any) {
        console.error("Error fetching note:", err);
        setError("Could not connect to the server or fetch note data.");
        setNote(null);
      } finally {
        setLoading(false);
        setAttemptingPassword(false);
      }
    },
    [slug]
  );

  useEffect(() => {
    if (slug) {
      fetchNote();
    }
  }, [slug, fetchNote]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptingPassword(true);
    setPasswordError(null);
    await fetchNote(enteredPassword);
  };

  /**
   * Handles copying the current note's URL to the clipboard.
   * Uses document.execCommand('copy') for broader compatibility in iframes.
   */
  const handleCopyLink = () => {
    const noteUrl = window.location.href;
    try {
      const tempInput = document.createElement("textarea");
      tempInput.value = noteUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand("copy");
      document.body.removeChild(tempInput);

      setCopyLinkMessage("Link copied!"); // Use copyLinkMessage
      setTimeout(() => setCopyLinkMessage(null), 2000);
    } catch (err) {
      console.error("Failed to copy link:", err);
      setCopyLinkMessage("Failed to copy link."); // Use copyLinkMessage
      setTimeout(() => setCopyLinkMessage(null), 2000);
    }
  };

  /**
   * Handles copying the current note's content to the clipboard.
   * Uses document.execCommand('copy') for broader compatibility in iframes.
   */
  const handleCopyContent = () => {
    // <-- NEW: handleCopyContent function
    if (!note?.content) {
      setCopyContentMessage("No content to copy.");
      setTimeout(() => setCopyContentMessage(null), 2000);
      return;
    }
    try {
      const tempInput = document.createElement("textarea");
      tempInput.value = note.content;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand("copy");
      document.body.removeChild(tempInput);

      setCopyContentMessage("Content copied!"); // Use copyContentMessage
      setTimeout(() => setCopyContentMessage(null), 2000);
    } catch (err) {
      console.error("Failed to copy content:", err);
      setCopyContentMessage("Failed to copy content."); // Use copyContentMessage
      setTimeout(() => setCopyContentMessage(null), 2000);
    }
  };

  // Helper to check if the note is currently expired on the client side
  const isNoteExpired = note?.expiresAt
    ? new Date(note.expiresAt) <= new Date()
    : false;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 sm:p-8">
      <div
        className="w-full max-w-full lg:max-w-[calc(100vw-8rem)] xl:max-w-[calc(100vw-12rem)] 2xl:max-w-[calc(100vw-16rem)]
                   bg-white p-8 rounded-lg shadow-xl my-4 lg:my-8 space-y-6"
      >
        {loading && !passwordRequired && !error && (
          <div className="flex flex-col items-center justify-center space-y-4 py-12">
            <RotateCw className="animate-spin h-10 w-10 text-[#7F56D9]" />
            <p className="text-gray-600">Loading Note...</p>
          </div>
        )}

        {error && (
          <div
            className={`${baseAlertClasses} bg-[#F8D7DA] border border-[#F5C6CB] text-[#721C24] flex items-center justify-center space-x-2`}
          >
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        {passwordRequired && !loading && !error && (
          <div className="flex flex-col items-center space-y-4 py-8">
            <Lock className="h-12 w-12 text-[#7F56D9]" />
            <h2 className="text-2xl font-bold text-[#1A202C]">
              Note Protected
            </h2>
            <p className="text-gray-600">
              Please enter the password to view this note.
            </p>
            <form
              onSubmit={handlePasswordSubmit}
              className="w-full max-w-sm space-y-4 mt-4"
            >
              <input
                type="password"
                className="block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                           focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                           text-gray-800 bg-white"
                placeholder="Enter password"
                value={enteredPassword}
                onChange={(e) => setEnteredPassword(e.target.value)}
                required
                disabled={attemptingPassword}
              />
              {passwordError && (
                <p className="text-sm text-center text-[#721C24]">
                  {passwordError}
                </p>
              )}
              <button
                type="submit"
                className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm
                           text-sm font-medium text-white bg-[#7F56D9] hover:bg-[#6A4BBA]
                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7F56D9]
                           transition duration-150 ease-in-out
                           disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={attemptingPassword}
              >
                {attemptingPassword ? (
                  <span className="flex items-center justify-center">
                    <RotateCw className="animate-spin h-5 w-5 mr-2" />
                    Unlocking...
                  </span>
                ) : (
                  "Unlock Note"
                )}
              </button>
            </form>
          </div>
        )}

        {note && !loading && !passwordRequired && !error && (
          <div className="prose max-w-none">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-3xl font-bold text-[#1A202C] flex items-center">
                {note.title}
                {note.isProtected && (
                  <Lock className="inline-block ml-3 h-6 w-6 text-gray-500" />
                )}
              </h1>
              {/* Buttons for Copy Link and Copy Content */}
              <div className="flex flex-col items-end space-y-2">
                <button
                  onClick={handleCopyLink}
                  className="py-1.5 px-3 border border-gray-200 rounded-md shadow-sm
                             text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200
                             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300
                             transition duration-150 ease-in-out flex items-center space-x-1"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copy Link</span>
                </button>
                {copyLinkMessage && (
                  <span className="text-xs text-gray-600 animate-fade-in-out">
                    {copyLinkMessage}
                  </span>
                )}
                {/* NEW: Copy Content Button */}
                <button
                  onClick={handleCopyContent}
                  className="py-1.5 px-3 border border-gray-200 rounded-md shadow-sm
                             text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200
                             focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300
                             transition duration-150 ease-in-out flex items-center space-x-1"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copy Content</span>
                </button>
                {copyContentMessage && (
                  <span className="text-xs text-gray-600 animate-fade-in-out">
                    {copyContentMessage}
                  </span>
                )}
              </div>
            </div>

            <div className="text-sm text-gray-500 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center">
              <span>Created: {new Date(note.createdAt).toLocaleString()}</span>
              <span>
                Last Updated: {new Date(note.updatedAt).toLocaleString()}
              </span>
              {note.expiresAt && (
                <span
                  className={`flex items-center space-x-1 ${
                    isNoteExpired
                      ? "text-red-600 font-semibold"
                      : "text-gray-600"
                  }`}
                >
                  <CalendarOff className="h-4 w-4" />
                  <span>
                    Expires: {new Date(note.expiresAt).toLocaleString()}
                    {isNoteExpired && " (Expired)"}
                  </span>
                </span>
              )}
            </div>
            {isNoteExpired && (
              <div
                className={`${baseAlertClasses} bg-[#F8D7DA] border border-[#F5C6CB] text-[#721C24] mb-6`}
              >
                <AlertCircle className="h-5 w-5" />
                <span>
                  This note has expired and its content may be removed soon.
                </span>
              </div>
            )}

            <div className="note-content text-gray-800 leading-relaxed">
              <ReactMarkdown>{note.content}</ReactMarkdown>
            </div>

            <div className="mt-8 flex flex-col sm:flex-row justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <button
                onClick={() => router.push(`/notes/${slug}/edit`)}
                className="py-2 px-4 border border-transparent rounded-md shadow-sm
                           text-sm font-medium text-white bg-[#7F56D9] hover:bg-[#6A4BBA]
                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7F56D9]
                           transition duration-150 ease-in-out flex items-center justify-center space-x-2"
              >
                <Edit className="h-4 w-4" />
                <span>Edit Note</span>
              </button>
              <button
                onClick={() => router.push(`/notes/${slug}/history`)}
                className="py-2 px-4 border border-transparent rounded-md shadow-sm
                           text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300
                           focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400
                           transition duration-150 ease-in-out flex items-center justify-center space-x-2"
              >
                <HistoryIcon className="h-4 w-4" />
                <span>View History</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
