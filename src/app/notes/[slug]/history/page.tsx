// src/app/notes/[slug]/history/page.tsx
// This component displays the historical versions of a MicroDoc note,
// handling password protection, allowing users to restore previous versions,
// and now includes diff-based viewing of changes between versions.

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  RotateCw,
  AlertCircle,
  Lock,
  History as HistoryIcon,
  Undo2,
} from "lucide-react";
import { diff_match_patch } from "diff-match-patch";

// Import the diff-match-patch library

// Initialize diff-match-patch
const dmp = new diff_match_patch();

// Define types for history data
interface HistoryEntry {
  content: string;
  timestamp: string; // ISO string
}

interface NoteHistoryData {
  title: string;
  history: HistoryEntry[];
  isProtected: boolean;
}

// Define type for current note data (needed for diffing latest history vs current)
interface CurrentNoteData {
  title: string;
  content: string;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

/**
 * DiffViewer Component: Renders the differences between two strings.
 * Highlights additions in green and deletions in red.
 */
interface DiffViewerProps {
  oldText: string;
  newText: string;
}

const DiffViewer: React.FC<DiffViewerProps> = ({ oldText, newText }) => {
  const diffs = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs); // Optional: improves readability of diffs

  return (
    <div className="font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
      {diffs.map((diff, i) => {
        const [type, text] = diff;
        if (type === 0) {
          // Common (no change)
          return <span key={i}>{text}</span>;
        } else if (type === -1) {
          // Deletion
          return (
            <del key={i} className="bg-red-200 text-red-800 no-underline">
              {text}
            </del>
          );
        } else {
          // Addition
          return (
            <ins key={i} className="bg-green-200 text-green-800 no-underline">
              {text}
            </ins>
          );
        }
      })}
    </div>
  );
};

export default function NoteHistoryPage() {
  const { slug } = useParams();
  const router = useRouter();

  // State for fetching history data
  const [noteHistory, setNoteHistory] = useState<NoteHistoryData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // State for current note data (to compare with latest history)
  const [currentNote, setCurrentNote] = useState<CurrentNoteData | null>(null);
  const [loadingCurrentNote, setLoadingCurrentNote] = useState<boolean>(true);
  const [currentNoteError, setCurrentNoteError] = useState<string | null>(null);

  // State for password protection when viewing history
  const [passwordRequired, setPasswordRequired] = useState<boolean>(false);
  const [enteredPassword, setEnteredPassword] = useState<string>(""); // Password used to initially view history
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [attemptingPassword, setAttemptingPassword] = useState<boolean>(false);

  // State for restore operation feedback and modal
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restorePasswordPrompt, setRestorePasswordPrompt] =
    useState<boolean>(false);
  const [restorePassword, setRestorePassword] = useState<string>("");
  const [restoreContent, setRestoreContent] = useState<string>("");
  const [restoreIndex, setRestoreIndex] = useState<number | null>(null);

  const baseAlertClasses =
    "mt-4 text-center px-4 py-3 rounded-md flex items-center justify-center space-x-2";

  /**
   * Fetches the note history data from the backend API.
   * Handles authentication for protected notes.
   * @param passwordAttempt Optional password string to send for authentication.
   */
  const fetchNoteHistory = useCallback(
    async (passwordAttempt: string | null = null) => {
      setLoading(true);
      setFetchError(null);
      setPasswordError(null);
      setPasswordRequired(false);
      setRestoreMessage(null);
      setRestoreError(null);

      try {
        let headers: HeadersInit = { "Content-Type": "application/json" };
        if (passwordAttempt) {
          headers["Authorization"] = `Bearer ${passwordAttempt}`;
        }

        const response = await fetch(`/api/notes/${slug}/history`, { headers });
        const data = await response.json();

        if (response.ok) {
          setNoteHistory(data);
          setPasswordRequired(false);
        } else if (
          response.status === 401 &&
          data.message === "Password required."
        ) {
          setPasswordRequired(true);
          setNoteHistory(null);
        } else if (
          response.status === 401 &&
          data.message === "Invalid password."
        ) {
          setPasswordRequired(true);
          setPasswordError("Incorrect password. Please try again.");
          setNoteHistory(null);
        } else {
          setFetchError(
            data.message ||
              `Failed to fetch note history: ${response.statusText}`
          );
          setNoteHistory(null);
        }
      } catch (err: any) {
        console.error("Error fetching note history:", err);
        setFetchError("Could not connect to the server or fetch note history.");
        setNoteHistory(null);
      } finally {
        setLoading(false);
        setAttemptingPassword(false);
      }
    },
    [slug]
  );

  /**
   * Fetches the current note data (for diffing with latest history entry).
   * Shares password context with history fetch.
   */
  const fetchCurrentNote = useCallback(
    async (passwordAttempt: string | null = null) => {
      setLoadingCurrentNote(true);
      setCurrentNoteError(null);
      try {
        let headers: HeadersInit = { "Content-Type": "application/json" };
        if (passwordAttempt) {
          headers["Authorization"] = `Bearer ${passwordAttempt}`;
        }
        const response = await fetch(`/api/notes/${slug}`, { headers });
        const data = await response.json();
        if (response.ok) {
          setCurrentNote(data.note);
        } else {
          setCurrentNoteError(
            data.message || "Failed to fetch current note for diffing."
          );
          setCurrentNote(null);
        }
      } catch (err: any) {
        console.error("Error fetching current note for diff:", err);
        setCurrentNoteError("Network error fetching current note.");
        setCurrentNote(null);
      } finally {
        setLoadingCurrentNote(false);
      }
    },
    [slug]
  );

  // Initial fetch when component mounts or slug changes
  useEffect(() => {
    if (slug) {
      fetchNoteHistory();
      // Fetch current note in parallel
      fetchCurrentNote();
    }
  }, [slug, fetchNoteHistory, fetchCurrentNote]);

  const handleViewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptingPassword(true);
    setPasswordError(null);
    await Promise.all([
      fetchNoteHistory(enteredPassword),
      fetchCurrentNote(enteredPassword), // Pass password to fetch current note too
    ]);
  };

  const handleRestoreClick = (contentToRestore: string, index: number) => {
    setRestoreContent(contentToRestore);
    setRestoreIndex(index);
    setRestoreError(null);
    setRestoreMessage(null);

    if (noteHistory?.isProtected) {
      setRestorePasswordPrompt(true);
    } else {
      handleConfirmRestore({ preventDefault: () => {} } as React.FormEvent);
    }
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRestoring(true);
    setRestoreError(null);
    setRestoreMessage(null);

    if (noteHistory?.isProtected && !restorePassword) {
      setRestoreError("Password is required to restore this version.");
      setIsRestoring(false);
      return;
    }

    try {
      const currentTitle = currentNote?.title; // Use current note's title for PUT request

      if (!currentTitle) {
        throw new Error(
          "Current note title not available for restore operation."
        );
      }

      const response = await fetch(`/api/notes/${slug}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: currentTitle,
          content: restoreContent,
          currentPassword: noteHistory?.isProtected
            ? restorePassword || enteredPassword
            : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setRestoreMessage(
          data.message || "Note version restored successfully!"
        );
        setRestorePasswordPrompt(false);
        setRestorePassword("");
        // Re-fetch both history and current note after restore
        await Promise.all([
          fetchNoteHistory(enteredPassword || restorePassword),
          fetchCurrentNote(enteredPassword || restorePassword),
        ]);
        setTimeout(() => router.push(`/notes/${slug}`), 2000);
      } else if (response.status === 401) {
        setRestoreError(data.message || "Authentication failed for restore.");
      } else {
        setRestoreError(data.message || "Failed to restore note version.");
      }
    } catch (err: any) {
      console.error("Error during restore:", err);
      setRestoreError(`An unexpected error occurred: ${err.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Determine overall loading state
  const overallLoading = loading || loadingCurrentNote;
  // Determine overall error state
  const overallError = fetchError || currentNoteError;

  if (overallLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 sm:p-8">
        <div className="flex flex-col items-center justify-center space-y-4 py-12 bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
          <RotateCw className="animate-spin h-10 w-10 text-[#7F56D9]" />
          <p className="text-gray-600">
            Loading Note History and Current Version...
          </p>
        </div>
      </div>
    );
  }

  if (overallError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 sm:p-8">
        <div className="flex flex-col items-center justify-center space-y-4 py-12 bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
          <div
            className={`${baseAlertClasses} bg-[#F8D7DA] border border-[#F5C6CB] text-[#721C24]`}
          >
            <AlertCircle className="h-5 w-5" />
            <span>{overallError}</span>
          </div>
        </div>
      </div>
    );
  }

  if (passwordRequired && !noteHistory) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 sm:p-8">
        <div className="flex flex-col items-center space-y-4 py-8 bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
          <Lock className="h-12 w-12 text-[#7F56D9]" />
          <h2 className="text-2xl font-bold text-[#1A202C]">Note Protected</h2>
          <p className="text-gray-600">
            Please enter the password to view this note's history.
          </p>
          <form
            onSubmit={handleViewPasswordSubmit}
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
                  Unlocking History...
                </span>
              ) : (
                "Unlock History"
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // If we reach here, noteHistory and currentNote are loaded and password (if any) is correct
  const reversedHistory = noteHistory?.history.slice().reverse() || [];
  const latestHistoryContent =
    reversedHistory.length > 0 ? reversedHistory[0].content : "";

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center
                 bg-[#F5F5F7] p-4 sm:p-8"
    >
      <div
        className="w-full max-w-full lg:max-w-[calc(100vw-8rem)] xl:max-w-[calc(100vw-12rem)] 2xl:max-w-[calc(100vw-16rem)]
                   bg-white p-8 rounded-lg shadow-xl my-4 lg:my-8 space-y-6"
      >
        <h1 className="text-3xl font-bold text-[#1A202C] text-center mb-6 flex items-center justify-center space-x-3">
          <HistoryIcon className="h-8 w-8 text-[#7F56D9]" />
          <span>History for "{noteHistory?.title}"</span>
        </h1>

        {/* Restore Password Prompt Modal */}
        {restorePasswordPrompt && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md space-y-4">
              <h2 className="text-xl font-bold text-[#1A202C] text-center">
                Confirm Restore
              </h2>
              <p className="text-gray-600 text-center">
                To restore version{" "}
                {restoreIndex !== null
                  ? noteHistory?.history.length - restoreIndex
                  : ""}
                , please enter the note's password.
              </p>
              <form onSubmit={handleConfirmRestore} className="space-y-4">
                <input
                  type="password"
                  className="block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                             focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                             text-gray-800 bg-white"
                  placeholder="Enter password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                  required={noteHistory?.isProtected}
                  disabled={isRestoring}
                />
                {restoreError && (
                  <p className="text-sm text-center text-[#721C24]">
                    {restoreError}
                  </p>
                )}
                {restoreMessage && (
                  <p className="text-sm text-center text-[#155724]">
                    {restoreMessage}
                  </p>
                )}
                <div className="flex justify-end space-x-4 mt-4">
                  <button
                    type="button"
                    onClick={() => setRestorePasswordPrompt(false)}
                    className="py-2 px-4 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md
                               focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400
                               transition duration-150 ease-in-out"
                    disabled={isRestoring}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="py-2 px-4 border border-transparent rounded-md shadow-sm
                               text-sm font-medium text-white bg-[#7F56D9] hover:bg-[#6A4BBA]
                               focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7F56D9]
                               transition duration-150 ease-in-out
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isRestoring}
                  >
                    {isRestoring ? (
                      <span className="flex items-center justify-center">
                        <RotateCw className="animate-spin h-5 w-5 mr-2" />
                        Restoring...
                      </span>
                    ) : (
                      "Restore"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Display Current Note Content (for context) */}
        {currentNote && (
          <div className="border border-blue-200 bg-blue-50 p-4 rounded-md shadow-sm mb-6">
            <h2 className="text-xl font-bold text-blue-800 mb-2 flex items-center space-x-2">
              <span>Current Note Content</span>
              {currentNote.isProtected && (
                <Lock className="h-5 w-5 text-blue-600" />
              )}
            </h2>
            <div className="text-sm text-gray-500 mb-3">
              Last Updated: {new Date(currentNote.updatedAt).toLocaleString()}
            </div>
            <div className="prose max-w-none text-gray-800 leading-relaxed">
              <ReactMarkdown>{currentNote.content}</ReactMarkdown>
            </div>
          </div>
        )}

        {reversedHistory.length === 0 ? (
          <div className="text-center text-gray-600 py-8">
            <p>
              No history found for this note yet. Changes will appear here after
              updates.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {reversedHistory.map((entry, index) => {
              // Determine which content to compare against
              const previousEntryContent = reversedHistory[index + 1]
                ? reversedHistory[index + 1].content
                : "";
              // Compare latest history entry with current note content
              const contentToCompareWith =
                index === 0 && currentNote
                  ? currentNote.content
                  : previousEntryContent;

              return (
                <div
                  key={index}
                  className="border-b border-gray-200 pb-6 last:border-b-0"
                >
                  <div className="flex justify-between items-center mb-3">
                    <h2 className="text-xl font-semibold text-[#1A202C]">
                      Version {noteHistory.history.length - index}
                    </h2>
                    <span className="text-sm text-gray-500">
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleRestoreClick(entry.content, index)}
                      className="py-1 px-2 border border-transparent rounded-md shadow-sm
                                 text-xs font-medium text-white bg-[#34D399] hover:bg-[#20B2AA]
                                 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#34D399]
                                 transition duration-150 ease-in-out flex items-center space-x-1"
                      disabled={isRestoring}
                    >
                      <Undo2 className="h-3 w-3" />
                      <span>Restore</span>
                    </button>
                  </div>
                  {/* Display the diff */}
                  <div className="bg-gray-50 p-4 rounded-md border border-gray-100 shadow-sm">
                    <h3 className="text-md font-medium text-gray-700 mb-2">
                      {index === 0 && currentNote
                        ? "Changes from Current Version"
                        : "Changes from Previous Version"}
                    </h3>
                    <DiffViewer
                      oldText={contentToCompareWith}
                      newText={entry.content}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action Buttons (Go back to view/edit) */}
        <div className="flex justify-center mt-6 space-x-4">
          <button
            onClick={() => router.push(`/notes/${slug}`)}
            className="py-2 px-4 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md
                       focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400
                       transition duration-150 ease-in-out"
            disabled={isRestoring}
          >
            Back to View Note
          </button>
          <button
            onClick={() => router.push(`/notes/${slug}/edit`)}
            className="py-2 px-4 text-white bg-[#7F56D9] hover:bg-[#6A4BBA] rounded-md
                       focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7F56D9]
                       transition duration-150 ease-in-out"
            disabled={isRestoring}
          >
            Edit Note
          </button>
        </div>
      </div>
    </div>
  );
}
