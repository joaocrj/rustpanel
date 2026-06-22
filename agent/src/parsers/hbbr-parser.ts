// =============================================================
// RustPanel Agent - HBBR Log Parser
// =============================================================

import { logger } from '../utils/logger.js';

export interface HbbrEvent {
  type: 'relay_request' | 'relay_paired' | 'relay_closed' | 'unknown';
  timestamp: Date;
  uuid?: string;
  ip?: string;
  port?: number;
  raw: string;
}

const patterns = {
  // INFO [src/relay_server.rs:452] New relay request <UUID> from [::ffff:<IP>]:<PORT>
  relayRequest: /[Nn]ew relay request\s+(\S+)\s+from\s+\[?::ffff:?([\d.]+)\]?:(\d+)/,
  // INFO [src/relay_server.rs:436] Relayrequest <UUID> from [::ffff:<IP>]:<PORT> got paired
  relayPaired: /[Rr]elay\s*request\s+(\S+)\s+from\s+\[?::ffff:?([\d.]+)\]?:?\d*\s+got paired/,
  // INFO Relay of [::ffff:<IP>]:<PORT> closed
  relayClosed: /[Rr]elay of\s+\[?::ffff:?([\d.]+)\]?:?(\d+)?\s+closed/,
  // Timestamp
  timestamp: /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\d.]*\s*[+-]?\d{0,4})\]/,
};

export function parseHbbrLine(line: string): HbbrEvent | null {
  if (!line || line.trim().length === 0) return null;

  const tsMatch = line.match(patterns.timestamp);
  const timestamp = tsMatch ? new Date(tsMatch[1]) : new Date();

  // New relay request
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

  // Relay paired
  const pairedMatch = line.match(patterns.relayPaired);
  if (pairedMatch) {
    return {
      type: 'relay_paired',
      timestamp,
      uuid: pairedMatch[1],
      ip: pairedMatch[2],
      raw: line,
    };
  }

  // Relay closed
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

  return null;
}
