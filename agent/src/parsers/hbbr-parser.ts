// =============================================================
// RustPanel Agent - HBBR Log Parser (v2 — Robust)
// =============================================================
//
// The RustDesk HBBR (relay server) emits log lines in this
// sequence for each relay session:
//
// 1. "New relay request <UUID> from [::ffff:<IP>]:<PORT>"
// 2. "Relay request <UUID> from [::ffff:<IP>]:<PORT> got paired"
// 3. "Both are raw" (actual data relay started)
// 4. "Relay of [::ffff:<IP>]:<PORT> closed"
//
// This parser captures all four stages.
//
// =============================================================

import { logger } from '../utils/logger.js';

export interface HbbrEvent {
  type: 'relay_request' | 'relay_paired' | 'relay_active' | 'relay_closed' | 'unknown';
  timestamp: Date;
  uuid?: string;
  ip?: string;
  port?: number;
  raw: string;
}

const patterns = {
  // Pro/Modern: New relay request <UUID> from [::ffff:<IP>]:<PORT>
  relayRequest: /[Nn]ew\s+relay\s*request\s+(\S+)\s+from\s+\[?::ffff:?([\d.]+)\]?:(\d+)/,

  // OSS: "Relayrequest <UUID> from [::ffff:<IP>]:<PORT>" (no space between Relay and request)
  relayRequestNoSpace: /[Rr]elayrequest\s+(\S+)\s+from\s+\[?::ffff:?([\d.]+)\]?:(\d+)/,

  // OSS: Relay request: <UUID> from <IP>
  relayRequestSimple: /[Rr]elay\s+request:\s*(\S+)\s+from\s+\[?(?:::ffff:?)?([\d.]+)\]?/i,

  // Pro/Modern: Relay request <UUID> from [::ffff:<IP>]:<PORT> got paired
  relayPaired: /[Rr]elay\s*request\s+(\S+)\s+from\s+\[?::ffff:?([\d.]+)\]?:?\d*\s+got\s+paired/,

  // OSS: "Relayrequest <UUID> from [::ffff:<IP>]:<PORT> got paired" (no space)
  relayPairedNoSpace: /[Rr]elayrequest\s+(\S+)\s+from\s+\[?::ffff:?([\d.]+)\]?:?\d*\s+got\s+paired/,

  // OSS: Relay paired: <UUID> from <IP>
  relayPairedSimple: /[Rr]elay\s+paired:\s*(\S+)\s+from\s+\[?(?:::ffff:?)?([\d.]+)\]?/i,

  // Both are raw (confirms data relay is actually flowing)
  relayActive: /[Bb]oth\s+are\s+raw/,

  // Pro/Modern: Relay of [::ffff:<IP>]:<PORT> closed
  relayClosed: /[Rr]elay\s+of\s+\[?::ffff:?([\d.]+)\]?:?(\d+)?\s+closed/,

  // OSS: Relay closed from <IP>
  relayClosedSimple: /[Rr]elay\s+closed\s+from\s+\[?(?:::ffff:?)?([\d.]+)\]?/i,

  // Timestamp
  timestamp: /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\d.]*\s*[+-]?\d{0,4})\]/,
};

// Track the most recently seen UUID for "Both are raw" correlation
let lastPairedUuid: string | undefined;
let lastPairedIp: string | undefined;

export function parseHbbrLine(line: string): HbbrEvent | null {
  if (!line || line.trim().length === 0) return null;

  const tsMatch = line.match(patterns.timestamp);
  const timestamp = tsMatch ? new Date(tsMatch[1]) : new Date();

  // 1. Relay request (Modern/Pro)
  const requestMatch = line.match(patterns.relayRequest);
  if (requestMatch) {
    return {
      type: 'relay_request',
      timestamp,
      uuid: requestMatch[1],
      ip: requestMatch[2],
      port: parseInt(requestMatch[3], 10),
      raw: line,
    };
  }

  // 1.1 Relay request (OSS — no space: "Relayrequest")
  const requestNoSpaceMatch = line.match(patterns.relayRequestNoSpace);
  if (requestNoSpaceMatch) {
    return {
      type: 'relay_request',
      timestamp,
      uuid: requestNoSpaceMatch[1],
      ip: requestNoSpaceMatch[2],
      port: parseInt(requestNoSpaceMatch[3], 10),
      raw: line,
    };
  }

  // 1.2 Relay request (Simple/OSS)
  const requestSimpleMatch = line.match(patterns.relayRequestSimple);
  if (requestSimpleMatch) {
    return {
      type: 'relay_request',
      timestamp,
      uuid: requestSimpleMatch[1],
      ip: requestSimpleMatch[2],
      raw: line,
    };
  }

  // 2. Relay paired (Modern/Pro)
  const pairedMatch = line.match(patterns.relayPaired);
  if (pairedMatch) {
    // Track for "Both are raw" correlation
    lastPairedUuid = pairedMatch[1];
    lastPairedIp = pairedMatch[2];

    return {
      type: 'relay_paired',
      timestamp,
      uuid: pairedMatch[1],
      ip: pairedMatch[2],
      raw: line,
    };
  }

  // 2.1 Relay paired (OSS — no space: "Relayrequest ... got paired")
  const pairedNoSpaceMatch = line.match(patterns.relayPairedNoSpace);
  if (pairedNoSpaceMatch) {
    lastPairedUuid = pairedNoSpaceMatch[1];
    lastPairedIp = pairedNoSpaceMatch[2];

    return {
      type: 'relay_paired',
      timestamp,
      uuid: pairedNoSpaceMatch[1],
      ip: pairedNoSpaceMatch[2],
      raw: line,
    };
  }

  // 2.2 Relay paired (Simple/OSS)
  const pairedSimpleMatch = line.match(patterns.relayPairedSimple);
  if (pairedSimpleMatch) {
    lastPairedUuid = pairedSimpleMatch[1];
    lastPairedIp = pairedSimpleMatch[2];

    return {
      type: 'relay_paired',
      timestamp,
      uuid: pairedSimpleMatch[1],
      ip: pairedSimpleMatch[2],
      raw: line,
    };
  }

  // 3. Both are raw — relay is now actively forwarding data
  const activeMatch = line.match(patterns.relayActive);
  if (activeMatch) {
    const event: HbbrEvent = {
      type: 'relay_active',
      timestamp,
      uuid: lastPairedUuid,
      ip: lastPairedIp,
      raw: line,
    };
    // Reset tracking to avoid stale correlation
    lastPairedUuid = undefined;
    lastPairedIp = undefined;
    return event;
  }

  // 4. Relay closed (Modern/Pro)
  const closedMatch = line.match(patterns.relayClosed);
  if (closedMatch) {
    return {
      type: 'relay_closed',
      timestamp,
      ip: closedMatch[1],
      port: closedMatch[2] ? parseInt(closedMatch[2], 10) : undefined,
      raw: line,
    };
  }

  // 4.1 Relay closed (Simple/OSS)
  const closedSimpleMatch = line.match(patterns.relayClosedSimple);
  if (closedSimpleMatch) {
    return {
      type: 'relay_closed',
      timestamp,
      ip: closedSimpleMatch[1],
      raw: line,
    };
  }

  return null;
}

/**
 * Reset parser state. Call when reconnecting to logs.
 */
export function resetHbbrParserState(): void {
  lastPairedUuid = undefined;
  lastPairedIp = undefined;
}
