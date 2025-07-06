// src/app/notes/[slug]/edit/page.tsx
// This page allows users to edit an existing MicroDoc note.
// It now includes a client-side profanity filter and an optional expiration date input.

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { RotateCw, AlertCircle, Lock } from "lucide-react";
import MarkdownEditor from "@/components/MarkdownEditor";
import { Filter } from "bad-words";

// Initialize the profanity filter
const filter = new Filter();

// Define a type for our note data received from the GET API
interface NoteData {
  title: string;
  content: string;
  isProtected: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string; // <-- NEW: Optional expiration date as ISO string
}

export default function EditNotePage() {
  const { slug } = useParams();
  const router = useRouter();

  // State for fetching/viewing the note data
  const [initialNote, setInitialNote] = useState<NoteData | null>(null);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [passwordRequired, setPasswordRequired] = useState<boolean>(false);
  const [enteredViewPassword, setEnteredViewPassword] = useState<string>("");
  const [viewPasswordError, setViewPasswordError] = useState<string | null>(
    null
  );
  const [attemptingViewPassword, setAttemptingViewPassword] =
    useState<boolean>(false);

  // State for the edit form
  const [title, setTitle] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [currentPasswordForUpdate, setCurrentPasswordForUpdate] =
    useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmNewPassword, setConfirmNewPassword] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>(""); // <-- NEW: State for expiration date (string for datetime-local)

  // State for update operation feedback
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [profanityDetected, setProfanityDetected] = useState<boolean>(false);

  const baseAlertClasses =
    "mt-4 text-center px-4 py-3 rounded-md flex items-center justify-center space-x-2";

  // Function to check for profanity and update state
  const checkProfanity = (text: string) => {
    if (filter.isProfane(text)) {
      setProfanityDetected(true);
      setUpdateError(
        "Profanity detected! Please remove inappropriate language."
      );
      return true;
    }
    setProfanityDetected(false);
    setUpdateError(null);
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

  // Function to fetch the note (similar to ViewNotePage)
  const fetchNoteForEdit = useCallback(
    async (passwordAttempt: string | null = null) => {
      setLoadingInitial(true);
      setFetchError(null);
      setViewPasswordError(null);
      setPasswordRequired(false);

      try {
        let headers: HeadersInit = { "Content-Type": "application/json" };
        if (passwordAttempt) {
          headers["Authorization"] = `Bearer ${passwordAttempt}`;
        }

        const response = await fetch(`/api/notes/${slug}`, { headers });
        const data = await response.json();

        if (response.ok) {
          setInitialNote(data.note);
          setTitle(data.note.title);
          setContent(data.note.content);
          setPasswordRequired(false);
          // Initial check for profanity after loading content
          checkProfanity(data.note.title + " " + data.note.content);
          // <-- NEW: Set expiresAt if present in fetched note
          if (data.note.expiresAt) {
            // Format ISO string to datetime-local format (YYYY-MM-DDTHH:MM)
            setExpiresAt(data.note.expiresAt.slice(0, 16));
          } else {
            setExpiresAt(""); // Clear if no expiration
          }
        } else if (
          response.status === 401 &&
          data.message === "Password required."
        ) {
          setPasswordRequired(true);
          setInitialNote(null);
        } else if (
          response.status === 401 &&
          data.message === "Invalid password."
        ) {
          setPasswordRequired(true);
          setViewPasswordError("Incorrect password. Please try again.");
          setInitialNote(null);
        } else {
          setFetchError(
            data.message || `Failed to fetch note: ${response.statusText}`
          );
          setInitialNote(null);
        }
      } catch (err: any) {
        console.error("Error fetching note for edit:", err);
        setFetchError("Could not connect to the server or fetch note data.");
        setInitialNote(null);
      } finally {
        setLoadingInitial(false);
        setAttemptingViewPassword(false);
      }
    },
    [slug]
  );

  // Initial fetch on component mount or slug change
  useEffect(() => {
    if (slug) {
      fetchNoteForEdit();
    }
  }, [slug, fetchNoteForEdit]);

  // Handler for submitting the password to view the note
  const handleViewPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttemptingViewPassword(true);
    setViewPasswordError(null);
    await fetchNoteForEdit(enteredViewPassword);
  };

  // Handler for submitting the edit form (PUT request)
  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdateMessage(null);
    setUpdateError(null);
    setIsUpdating(true);

    // Re-check profanity just before submission
    if (checkProfanity(title + " " + content)) {
      setIsUpdating(false);
      return;
    }

    if (!title.trim() || !content.trim()) {
      setUpdateError("Title and content cannot be empty.");
      setIsUpdating(false);
      return;
    }

    if (newPassword && newPassword !== confirmNewPassword) {
      setUpdateError("New passwords do not match.");
      setIsUpdating(false);
      return;
    }

    // --- NEW: Validate expiration date on frontend before sending ---
    let expirationDateToSend: string | null | undefined = undefined; // Can be string, null (to clear), or undefined (no change)
    if (expiresAt) {
      const selectedDate = new Date(expiresAt);
      const now = new Date();
      if (selectedDate <= now) {
        setUpdateError("Expiration date must be in the future.");
        setIsUpdating(false);
        return;
      }
      expirationDateToSend = selectedDate.toISOString(); // Send as ISO string
    } else if (expiresAt === "") {
      expirationDateToSend = null; // If input is cleared, send null to backend to clear expiresAt
    }
    // --- END NEW ---

    let passwordToSend = currentPasswordForUpdate;
    if (initialNote?.isProtected && !currentPasswordForUpdate) {
      passwordToSend = enteredViewPassword;
    }

    try {
      const response = await fetch(`/api/notes/${slug}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          content,
          currentPassword: passwordToSend,
          newPassword: newPassword || undefined,
          expiresAt: expirationDateToSend, // <-- NEW: Include expiresAt in the body
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUpdateMessage(data.message || "Note updated successfully!");
        setCurrentPasswordForUpdate("");
        setNewPassword("");
        setConfirmNewPassword("");
        // Re-fetch to update local state and potentially the expiresAt field
        await fetchNoteForEdit(passwordToSend);
        setTimeout(() => router.push(`/notes/${slug}`), 2000);
      } else if (response.status === 401) {
        setUpdateError(data.message || "Authentication required to update.");
      } else {
        if (data.error && data.error.includes("Profanity")) {
          setUpdateError(data.error);
        } else {
          setUpdateError(
            data.message || "Failed to update note. Please try again."
          );
        }
      }
    } catch (err: any) {
      console.error("Fetch update error:", err);
      setUpdateError(
        "An unexpected error occurred during update. Please try again."
      );
    } finally {
      setIsUpdating(false);
    }
  };

  // Render logic
  if (loadingInitial) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 sm:p-8">
        <div className="flex flex-col items-center justify-center space-y-4 py-12 bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
          <RotateCw className="animate-spin h-10 w-10 text-[#7F56D9]" />
          <p className="text-gray-600">Loading Note for Editing...</p>
        </div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 sm:p-8">
        <div className="flex flex-col items-center justify-center space-y-4 py-12 bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
          <div
            className={`${baseAlertClasses} bg-[#F8D7DA] border border-[#F5C6CB] text-[#721C24]`}
          >
            <AlertCircle className="h-5 w-5" />
            <span>{fetchError}</span>
          </div>
        </div>
      </div>
    );
  }

  if (passwordRequired && !initialNote) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F5F5F7] p-4 sm:p-8">
        <div className="flex flex-col items-center space-y-4 py-8 bg-white p-8 rounded-lg shadow-xl w-full max-w-lg">
          <Lock className="h-12 w-12 text-[#7F56D9]" />
          <h2 className="text-2xl font-bold text-[#1A202C]">Note Protected</h2>
          <p className="text-gray-600">
            Please enter the password to edit this note.
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
              value={enteredViewPassword}
              onChange={(e) => setEnteredViewPassword(e.target.value)}
              required
              disabled={attemptingViewPassword}
            />
            {viewPasswordError && (
              <p className="text-sm text-center text-[#721C24]">
                {viewPasswordError}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm
                         text-sm font-medium text-white bg-[#7F56D9] hover:bg-[#6A4BBA]
                         focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7F56D9]
                         transition duration-150 ease-in-out
                         disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={attemptingViewPassword}
            >
              {attemptingViewPassword ? (
                <span className="flex items-center justify-center">
                  <RotateCw className="animate-spin h-5 w-5 mr-2" />
                  Unlocking...
                </span>
              ) : (
                "Unlock Note for Editing"
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

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
          Edit MicroDoc: "{initialNote?.title}"
        </h1>

        <form onSubmit={handleUpdateSubmit} className="space-y-4">
          {/* Title Input */}
          <div>
            <label
              htmlFor="edit-title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Title
            </label>
            <input
              type="text"
              id="edit-title"
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
              required
              disabled={isUpdating}
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
              rows={15}
              disabled={isUpdating}
              className={profanityDetected ? "border-red-400" : ""}
            />
          </div>

          {/* Current Password for Update (Conditionally rendered) */}
          {initialNote?.isProtected && (
            <div>
              <label
                htmlFor="current-password-update"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Current Password (required to save changes)
              </label>
              <input
                type="password"
                id="current-password-update"
                className="mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                           focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                           text-gray-800 bg-white"
                value={currentPasswordForUpdate}
                onChange={(e) => setCurrentPasswordForUpdate(e.target.value)}
                placeholder="Enter current password to confirm changes"
                required={initialNote.isProtected}
                disabled={isUpdating}
              />
              <p className="mt-1 text-xs text-gray-500">
                You used this password to unlock the note. Enter it here to save
                changes.
              </p>
            </div>
          )}

          {/* New Password */}
          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              New Password (Optional, leave blank to keep current)
            </label>
            <input
              type="password"
              id="new-password"
              className="mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                         focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                         text-gray-800 bg-white"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current password"
              disabled={isUpdating}
            />
          </div>

          {/* Confirm New Password */}
          {newPassword && (
            <div>
              <label
                htmlFor="confirm-new-password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm New Password
              </label>
              <input
                type="password"
                id="confirm-new-password"
                className="mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                           focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                           text-gray-800 bg-white"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm your new password"
                required={!!newPassword}
                disabled={isUpdating}
              />
            </div>
          )}

          {/* Expiration Date Input */}
          <div>
            <label
              htmlFor="edit-expiresAt"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Expires At (Optional)
            </label>
            <input
              type="datetime-local"
              id="edit-expiresAt"
              className="mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                         focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                         text-gray-800 bg-white"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)} // Min date is current datetime
              disabled={isUpdating}
            />
            <p className="mt-1 text-xs text-gray-500">
              Note will automatically become inaccessible after this date and
              time. Leave blank to remove expiration.
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
            disabled={isUpdating || profanityDetected}
          >
            {isUpdating ? (
              <span className="flex items-center justify-center">
                <RotateCw className="animate-spin h-5 w-5 mr-3 text-white" />
                Saving Changes...
              </span>
            ) : (
              "Save Changes"
            )}
          </button>
        </form>

        {/* Update Messages */}
        {updateMessage && (
          <p
            className={`${baseAlertClasses} bg-[#D4EDDA] border border-[#C3E6CB] text-[#155724]`}
          >
            {updateMessage}
          </p>
        )}
        {updateError && (
          <p
            className={`${baseAlertClasses} bg-[#F8D7DA] border border-[#F5C6CB] text-[#721C24]`}
          >
            {updateError}
          </p>
        )}

        {/* Action Buttons (Go back to view) */}
        <div className="flex justify-center mt-6">
          <button
            onClick={() => router.push(`/notes/${slug}`)}
            className="py-2 px-4 text-gray-700 bg-gray-200 hover:bg-gray-300 rounded-md
                       focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400
                       transition duration-150 ease-in-out"
            disabled={isUpdating}
          >
            Back to View Note
          </button>
        </div>
      </div>
    </div>
  );
}
