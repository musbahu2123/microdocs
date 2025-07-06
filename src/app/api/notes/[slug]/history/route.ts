// src/app/api/notes/[slug]/history/route.ts
// This API route fetches the historical versions of a MicroDoc note.
// It now includes basic rate limiting.

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '../../../../../lib/mongodb';
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
 // Ensure Filter is imported if you plan to add profanity check here later

// --- NEW: Rate Limiting Configuration and Storage (Local to this file) ---
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const WINDOW_SIZE_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 10; // Max 10 requests per minute per IP
                                    // (Same as GET/PUT for notes)

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

// Define a type for a single history entry
interface NoteHistoryEntry {
  content: string;
  timestamp: Date;
}

// Define a type for our note data as stored in DB, focusing on history
interface DbNoteWithHistory {
  _id: ObjectId;
  slug: string;
  title: string;
  passwordHash?: string;
  history: NoteHistoryEntry[];
  expiresAt?: Date; // Include expiresAt for expiration check
}

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

    // Find the note, projecting only necessary fields
    const note: DbNoteWithHistory | null = await db.collection('notes').findOne(
      { slug: slug },
      { projection: { passwordHash: 1, history: 1, title: 1, expiresAt: 1 } } // Include expiresAt in projection
    );

    if (!note) {
      return NextResponse.json({ message: 'Note not found.' }, { status: 404 });
    }

    // Check for expiration date before returning history
    if (note.expiresAt && note.expiresAt <= new Date()) {
      return NextResponse.json({ message: 'Note has expired.' }, { status: 404 });
    }

    // Password Protection Logic
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

    // Prepare History Data for Response
    const historyResponse = (note.history || []).map(entry => ({
      content: entry.content,
      timestamp: entry.timestamp.toISOString(),
    }));

    return NextResponse.json(
      {
        title: note.title,
        history: historyResponse,
        isProtected: isProtected,
      },
      { status: 200 }
    );

  } catch (error: any) {
    console.error('Error fetching note history:', error);
    return NextResponse.json(
      { message: 'Failed to retrieve note history.', error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
