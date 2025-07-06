// src/app/api/notes/[slug]/route.ts
// This API route handles fetching and updating MicroDoc notes.
// It now includes server-side profanity filter, expiration date handling,
// and basic rate limiting for both GET and PUT requests.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import {Filter} from 'bad-words';

// Initialize the profanity filter for server-side use
const filter = new Filter();

// --- NEW: Rate Limiting Configuration and Storage (Local to this file) ---
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const WINDOW_SIZE_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // Max 10 requests per minute per IP for GET/PUT
                                    // (Higher than POST as viewing/editing is more frequent)

/**
 * Applies rate limiting logic.
 * @param req The NextRequest object.
 * @returns NextResponse if rate limit exceeded, otherwise null.
 */
function applyRateLimit(req: NextRequest): NextResponse | null {
  const ip = req.ip || req.headers.get('x-forwarded-for') || 'anonymous';
  const now = Date.now();

  const clientData = rateLimitStore.get(ip) || { count: 0, lastReset: now };

  // Reset count if window has passed
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
  return null; // Rate limit not exceeded
}
// --- END NEW ---

// Optional: Define an interface for the Note structure as stored in DB
interface DbNote {
  _id: ObjectId;
  slug: string;
  title: string;
  content: string;
  passwordHash?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  history: Array<{ content: string; timestamp: Date }>;
}

// --- GET Method ---
export async function GET(
  req: NextRequest,
  context: { params: { slug: string } }
) {
  // --- NEW: Apply Rate Limiting ---
  const rateLimitResponse = applyRateLimit(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  // --- END NEW ---

  try {
    const { slug } = await Promise.resolve(context.params);
    const { db } = await connectToDatabase();
    const note: DbNote | null = await db.collection('notes').findOne({ slug: slug });

    if (!note) {
      return NextResponse.json({ message: 'Note not found.' }, { status: 404 });
    }

    // Check for expiration date
    if (note.expiresAt && note.expiresAt <= new Date()) {
      return NextResponse.json({ message: 'Note has expired.' }, { status: 404 });
    }

    const isProtected = !!note.passwordHash;

    if (isProtected) {
      const authHeader = req.headers.get('Authorization');
      const token = authHeader?.split(' ')[1];

      if (!token) {
        return NextResponse.json({ message: 'Password required.' }, { status: 401 });
      }

      const isPasswordValid = await bcrypt.compare(token, note.passwordHash as string);

      if (!isPasswordValid) {
        return NextResponse.json({ message: 'Invalid password.' }, { status: 401 });
      }
    }

    const noteResponse = {
      title: note.title,
      content: note.content,
      isProtected: isProtected,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      expiresAt: note.expiresAt ? note.expiresAt.toISOString() : undefined,
    };

    return NextResponse.json({ note: noteResponse }, { status: 200 });

  } catch (error: any) {
    console.error('Error fetching note:', error);
    return NextResponse.json(
      { message: 'Failed to retrieve note.', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// --- PUT Method ---
export async function PUT(
  req: NextRequest,
  context: { params: { slug: string } }
) {
  // --- NEW: Apply Rate Limiting ---
  const rateLimitResponse = applyRateLimit(req);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  // --- END NEW ---

  try {
    const { slug } = await Promise.resolve(context.params);
    const { db } = await connectToDatabase();

    const {
      title,
      content,
      currentPassword,
      newPassword,
      expiresAt
    } = await req.json();

    // Basic validation
    if (!title || !content) {
      return NextResponse.json(
        { message: 'Title and content are required for update.' },
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

    // 1. Find the note to be updated
    const note: DbNote | null = await db.collection('notes').findOne({ slug: slug });

    if (!note) {
      return NextResponse.json({ message: 'Note not found.' }, { status: 404 });
    }

    // Check if note is already expired before allowing update
    if (note.expiresAt && note.expiresAt <= new Date()) {
      return NextResponse.json({ message: 'Cannot update an expired note.' }, { status: 400 });
    }

    // 2. Authentication: Check if currentPassword is required and valid
    const isProtected = !!note.passwordHash;
    if (isProtected) {
      if (!currentPassword) {
        return NextResponse.json({ message: 'Current password required to update this note.' }, { status: 401 });
      }
      const isPasswordValid = await bcrypt.compare(currentPassword, note.passwordHash as string);
      if (!isPasswordValid) {
        return NextResponse.json({ message: 'Incorrect password.' }, { status: 401 });
      }
    }

    // 3. Prepare Update Operations
    const updateDoc: any = {
      $set: {
        title: title,
        content: content,
        updatedAt: new Date(),
      },
      $push: {}
    };

    if (newPassword) {
      updateDoc.$set.passwordHash = await bcrypt.hash(newPassword, 10);
    }

    // Handle expiresAt update
    if (expiresAt === null) {
      updateDoc.$set.expiresAt = null;
    } else if (expiresAt) {
      const expirationDate = new Date(expiresAt);
      if (expirationDate <= new Date()) {
        return NextResponse.json(
          { message: 'Expiration date must be in the future.' },
          { status: 400 }
        );
      }
      updateDoc.$set.expiresAt = expirationDate;
    }

    if (note.content !== content) {
      updateDoc.$push = {
        history: {
          content: content,
          timestamp: new Date(),
        },
      };
    } else {
      delete updateDoc.$push;
    }

    // 4. Perform the Update
    const result = await db.collection('notes').updateOne(
      { slug: slug },
      updateDoc
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ message: 'Note not found for update.' }, { status: 404 });
    }

    if (result.modifiedCount === 0 && (note.content === content) && !newPassword && (expiresAt === undefined || (note.expiresAt?.toISOString() === expiresAt))) {
      return NextResponse.json({ message: 'No changes detected to update.' }, { status: 200 });
    }

    return NextResponse.json({ message: 'Note updated successfully!' }, { status: 200 });

  } catch (error: any) {
    console.error('Error updating note:', error);
    return NextResponse.json(
      { message: 'Failed to update note.', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
