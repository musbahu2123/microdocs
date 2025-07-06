// src/components/MarkdownEditor.tsx
// This component now includes live preview, syntax highlighting for code blocks,
// and enables the browser's native spellcheck for the input area.

"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { atomDark } from "react-syntax-highlighter/dist/esm/styles/prism";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  className?: string;
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = "Start writing your note here using Markdown...",
  rows = 10,
  disabled = false,
  className = "",
}: MarkdownEditorProps) {
  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Markdown Input Area */}
      <div className="flex-1">
        <label htmlFor="markdown-input" className="sr-only">
          Markdown Input
        </label>
        <textarea
          id="markdown-input"
          className={`mt-1 block w-full px-3 py-2 border border-[#D1D5DB] rounded-md shadow-sm
                      focus:outline-none focus:ring-[#7F56D9] focus:border-[#7F56D9] sm:text-sm
                      text-gray-800 bg-white ${className}`}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck="true"
        ></textarea>
      </div>

      {/* Live Markdown Preview Area */}
      <div className="flex-1 p-4 bg-gray-50 rounded-md border border-gray-100 shadow-sm overflow-auto max-h-[500px]">
        <h3 className="text-lg font-semibold text-gray-700 mb-2 border-b border-gray-200 pb-2">
          Live Preview
        </h3>
        <div className="prose max-w-none text-gray-800 leading-relaxed">
          <ReactMarkdown
            components={{
              // Custom renderer for <code> blocks (code fences)
              code({ node, inline, className, children, ref, ...rest }) {
                // <-- FIX: Destructure 'ref' here
                const match = /language-(\w+)/.exec(className || "");

                if (inline) {
                  return (
                    <code
                      className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm font-mono"
                      {...rest}
                    >
                      {" "}
                      {/* Use 'rest' props */}
                      {children}
                    </code>
                  );
                }

                return match ? (
                  <SyntaxHighlighter
                    style={atomDark}
                    language={match[1]}
                    PreTag="div"
                    {...rest} // <-- FIX: Pass 'rest' props to SyntaxHighlighter
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                ) : (
                  <code
                    className="bg-gray-200 text-gray-800 p-2 rounded text-sm font-mono block overflow-x-auto"
                    {...rest}
                  >
                    {" "}
                    {/* Use 'rest' props */}
                    {children}
                  </code>
                );
              },
            }}
          >
            {value}
          </ReactMarkdown>
        </div>
        {value.trim() === "" && (
          <p className="text-gray-500 italic">
            Your Markdown preview will appear here as you type.
          </p>
        )}
      </div>
    </div>
  );
}
