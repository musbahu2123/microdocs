// src/app/api/notes/route.ts
// This API route handles the creation of new MicroDoc notes.
// It now includes a server-side profanity filter, basic rate limiting,
// and supports optional expiration dates for notes.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import {Filter} from 'bad-words';

// Initialize the profanity filter for server-side use
const filter = new Filter();

// Rate Limiting Configuration and Storage
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const WINDOW_SIZE_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 requests per minute per IP

// Define a type for our note data for better type safety
interface NoteContent {
  content: string;
  timestamp: Date;
}

interface Note {
  slug: string;
  title: string;
  content: string;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date; // <-- NEW: Optional expiration date
  history: NoteContent[];
}

const NANOID_SLUG_LENGTH = 8;

/**
 * Helper function to generate a unique slug.
 * If a custom slug is provided, it tries to use that.
 * Otherwise, it generates a random one.
 * It ensures the slug is unique in the database.
 */
async function generateUniqueSlug(
  db: any,
  proposedSlug?: string | null
): Promise<string> {
  let baseSlug = proposedSlug?.trim().toLowerCase().replace(/\s+/g, '-') || '';
  if (baseSlug) {
    baseSlug = baseSlug.replace(/[^a-z0-9-]/g, '');
    if (baseSlug.length > 50) baseSlug = baseSlug.substring(0, 50);
  }

  let finalSlug: string;
  let isUnique = false;
  let attempts = 0;
  const MAX_ATTEMPTS = 5;

  while (!isUnique && attempts < MAX_ATTEMPTS) {
    let currentSlug = baseSlug;
    if (baseSlug && attempts > 0) {
      currentSlug = `${baseSlug}-${nanoid(4)}`;
    } else if (!baseSlug) {
      currentSlug = nanoid(NANOID_SLUG_LENGTH);
    }

    const existingNote = await db.collection('notes').findOne({ slug: currentSlug });
    if (!existingNote) {
      isUnique = true;
      finalSlug = currentSlug;
    } else {
      attempts++;
      console.warn(`Slug '${currentSlug}' already exists. Attempting another.`);
    }
  }

  if (!isUnique) {
    console.error(`Could not generate unique slug from '${proposedSlug}'. Generating fully random slug.`);
    let fallbackSlug: string;
    let fallbackUnique = false;
    while (!fallbackUnique) {
      fallbackSlug = nanoid(NANOID_SLUG_LENGTH);
      const existing = await db.collection('notes').findOne({ slug: fallbackSlug });
      if (!existing) {
        fallbackUnique = true;
        finalSlug = fallbackSlug;
      }
    }
  }

  return finalSlug!;
}


export async function POST(req: NextRequest) {
  // Rate Limiting Logic
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'anonymous';
  const now = Date.now();

  const clientData = rateLimitStore.get(ip) || { count: 0, lastReset: now };

  if (now - clientData.lastReset > WINDOW_SIZE_MS) {
    clientData.count = 0;
    clientData.lastReset = now;
  }

  clientData.count++;
  rateLimitStore.set(ip, clientData);

  if (clientData.count > MAX_REQUESTS_PER_WINDOW) {
    const timeLeft = Math.ceil((clientData.lastReset + WINDOW_SIZE_MS - now) / 1000);
    return NextResponse.json(
      { message: `Too many requests. Please try again in ${timeLeft} seconds.` },
      { status: 429, headers: { 'Retry-After': timeLeft.toString() } }
    );
  }

  try {
    const { client, db } = await connectToDatabase();

    const {
      title,
      content,
      password,
      customSlug,
      expiresAt // <-- NEW: Get expiresAt from request body
    } = await req.json();

    // Basic validation
    if (!title || !content) {
      return NextResponse.json(
        { message: 'Title and content are required.' },
        { status: 400 }
      );
    }

    // Server-side Profanity Filter
    const combinedText = `${title} ${content}`;
    if (filter.isProfane(combinedText)) {
      return NextResponse.json(
        { message: 'Profanity detected in title or content. Please remove inappropriate language.', error: 'Profanity detected' },
        { status: 400 }
      );
    }

    // Generate unique slug
    const finalSlug = await generateUniqueSlug(db, customSlug || title);

    let passwordHash: string | undefined;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    const noteCreationTime = new Date();

    const newNote: Note = {
      slug: finalSlug,
      title: title,
      content: content,
      passwordHash: passwordHash,
      createdAt: noteCreationTime,
      updatedAt: noteCreationTime,
      history: [{ content: content, timestamp: noteCreationTime }],
    };

    // --- NEW: Add expiresAt if provided and valid ---
    if (expiresAt) {
      const expirationDate = new Date(expiresAt);
      // Ensure the expiration date is in the future
      if (expirationDate > noteCreationTime) {
        newNote.expiresAt = expirationDate;
      } else {
        return NextResponse.json(
          { message: 'Expiration date must be in the future.' },
          { status: 400 }
        );
      }
    }
    // --- END NEW ---

    const result = await db.collection('notes').insertOne(newNote);

    if (result.acknowledged) {
      return NextResponse.json(
        {
          message: 'Note created successfully!',
          slug: finalSlug,
          id: result.insertedId,
        },
        { status: 201 }
      );
    } else {
      throw new Error('Failed to insert document.');
    }
  } catch (error: any) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { message: 'Failed to create note.', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
