// =============================================================
// RustPanel Agent - HBBS Log Parser (v2 — Robust)
// =============================================================
//
// The RustDesk HBBS (rendezvous/ID server) emits various log
// formats depending on the version. This parser supports:
//
// 1. Legacy format:  "Registering client: ID=<ID>, IP=<IP>"
// 2. Modern formats:
//    - "New connection from <IP>:<PORT>"
//    - "Tcp connection from [::ffff:<IP>]:<PORT>"
//    - "<ID> from <IP>:<PORT>" (handle_udp context)
//    - "update_addr: <ID>, addr: [::ffff:<IP>]:<PORT>"
//    - "punch_hole request from <ID>" (peer activity)
//    - "register_pk" — NOTE: server-side register_pk does NOT
//      contain the RustDesk ID, only IPs. We capture the IP
//      but do NOT try to extract an ID from these lines.
//
// =============================================================

import { logger } from '../utils/logger.js';

export interface HbbsEvent {
  type: 'peer_register' | 'peer_activity' | 'tcp_connection' | 'unknown';
  timestamp: Date;
  peerId?: string;
  ip?: string;
  port?: number;
  raw: string;
}

// ---- Regex Patterns ----

const patterns = {
  // update_pk <ID> [::ffff:<IP>]:<PORT>
  updatePk: /update_pk\s+(\d{6,12})\s+\[?(?:::ffff:?)?([\d.]+)\]?:(\d+)/i,

  // IP change of <ID> from <OLD_IP_PORT> to <NEW_IP_PORT>
  ipChange: /IP change of\s+(\d{6,12})\s+from\s+\S+\s+to\s+\[?(?:::ffff:?)?([\d.]+)\]?:(\d+)/i,

  // Legacy: Registering client: ID=123456789, IP=1.2.3.4
  legacyRegister: /Registering client:\s*ID=([\d]+),?\s*IP=(\S+)/i,

  // Tcp connection from [::ffff:1.2.3.4]:12345, ws: true/false
  tcpConnection: /Tcp connection from\s+\[?::ffff:?([\d.]+)\]?:(\d+)/i,

  // handle_udp context: "<RUSTDESK_ID> from [::ffff:<IP>]:<PORT>"
  // Example: "123456789 from [::ffff:203.0.113.5]:21116"
  // The ID is a numeric string of 6-12 digits at the start or after known context
  handleUdp: /\b(\d{6,12})\s+from\s+\[?::ffff:?([\d.]+)\]?:(\d+)/,

  // update_addr: <ID>, addr: [::ffff:<IP>]:<PORT>
  // or: update_addr <ID> [::ffff:<IP>]:<PORT>
  updateAddr: /update_addr[:\s]+(\d{6,12})[\s,]+(?:addr[:\s]+)?\[?::ffff:?([\d.]+)\]?:(\d+)/i,

  // punch_hole request from <ID> to <ID>
  punchHole: /punch_hole\s+request\s+from\s+(\d{6,12})\s+(?:to|=>)\s+(\d{6,12})/i,

  // register_pk — only captures IP, NOT the ID (server-side doesn't log ID)
  // "register_pk: [::ffff:1.2.3.4]:12345"
  // or: "register_pk of 1.2.3.4:21116"
  registerPkIpOnly: /register_pk[:\s]+(?:of\s+)?\[?(?:::ffff:?)?([\d.]+)\]?:(\d+)/i,

  // Generic: any line mentioning a RustDesk numeric ID in meaningful context
  // Must be preceded by known keywords to avoid false positives
  idInContext: /(?:id|peer|client)[=:\s]+(\d{6,12})\b/i,

  // Timestamp extraction: [2024-01-15 10:30:45.123 +0000]
  timestamp: /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\d.]*\s*[+-]?\d{0,4})\]/,
};

/**
 * Extracts a clean IPv4 address from a log line.
 * Uses targeted extraction from known patterns rather than
 * a generic regex that could match timestamps or other numbers.
 */
function extractIPFromLine(line: string): string | undefined {
  // Pattern 1: [::ffff:1.2.3.4]:PORT
  const ipv6Mapped = line.match(/\[?::ffff:?([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})\]?:\d+/);
  if (ipv6Mapped) return ipv6Mapped[1];

  // Pattern 2: "from 1.2.3.4:PORT" or "addr: 1.2.3.4:PORT"
  const fromIp = line.match(/(?:from|addr[:\s])\s*([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}):\d+/);
  if (fromIp) return fromIp[1];

  // Pattern 3: "IP=1.2.3.4"
  const ipEquals = line.match(/IP=([\d]{1,3}\.[\d]{1,3}\.[\d]{1,3}\.[\d]{1,3})/);
  if (ipEquals) return ipEquals[1];

  return undefined;
}

/**
 * Validates that a string looks like a real RustDesk ID.
 * RustDesk IDs are typically 9 digits, but can range from 6-12.
 * We filter out obvious non-IDs (ports like 21116, 21117, etc.)
 */
function isValidRustdeskId(id: string): boolean {
  if (!id || id.length < 6 || id.length > 12) return false;
  // Filter known port numbers
  const knownPorts = ['21115', '21116', '21117', '21118', '21119'];
  if (knownPorts.includes(id)) return false;
  // Must be purely numeric
  if (!/^\d+$/.test(id)) return false;
  return true;
}

function cleanIP(ip: string): string {
  return ip
    .replace(/^\[?::ffff:/i, '')
    .replace(/\]$/, '')
    .replace(/:\d+$/, '');
}

export function parseHbbsLine(line: string): HbbsEvent | null {
  if (!line || line.trim().length === 0) return null;

  const tsMatch = line.match(patterns.timestamp);
  const timestamp = tsMatch ? new Date(tsMatch[1]) : new Date();

  // ---- 0.1 update_pk (highest priority for modern OSS logs) ----
  const pkUpdateMatch = line.match(patterns.updatePk);
  if (pkUpdateMatch && isValidRustdeskId(pkUpdateMatch[1])) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: pkUpdateMatch[1],
      ip: cleanIP(pkUpdateMatch[2]),
      port: parseInt(pkUpdateMatch[3], 10),
      raw: line,
    };
  }

  // ---- 0.2 IP change of client ----
  const ipChangeMatch = line.match(patterns.ipChange);
  if (ipChangeMatch && isValidRustdeskId(ipChangeMatch[1])) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: ipChangeMatch[1],
      ip: cleanIP(ipChangeMatch[2]),
      port: parseInt(ipChangeMatch[3], 10),
      raw: line,
    };
  }

  // ---- 1. Legacy registration ----
  const legacyMatch = line.match(patterns.legacyRegister);
  if (legacyMatch && isValidRustdeskId(legacyMatch[1])) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: legacyMatch[1],
      ip: cleanIP(legacyMatch[2]),
      raw: line,
    };
  }

  // ---- 2. update_addr with explicit ID ----
  const addrMatch = line.match(patterns.updateAddr);
  if (addrMatch && isValidRustdeskId(addrMatch[1])) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: addrMatch[1],
      ip: addrMatch[2],
      port: parseInt(addrMatch[3], 10),
      raw: line,
    };
  }

  // ---- 3. handle_udp: "ID from IP:PORT" ----
  const udpMatch = line.match(patterns.handleUdp);
  if (udpMatch && isValidRustdeskId(udpMatch[1])) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: udpMatch[1],
      ip: udpMatch[2],
      port: parseInt(udpMatch[3], 10),
      raw: line,
    };
  }

  // ---- 4. punch_hole request (peer activity, both peers are "alive") ----
  const punchMatch = line.match(patterns.punchHole);
  if (punchMatch) {
    // Emit event for the source peer
    if (isValidRustdeskId(punchMatch[1])) {
      return {
        type: 'peer_activity',
        timestamp,
        peerId: punchMatch[1],
        raw: line,
      };
    }
  }

  // ---- 5. TCP connection (IP only, no ID) ----
  const tcpMatch = line.match(patterns.tcpConnection);
  if (tcpMatch) {
    return {
      type: 'tcp_connection',
      timestamp,
      ip: tcpMatch[1],
      port: parseInt(tcpMatch[2], 10),
      raw: line,
    };
  }

  // ---- 6. ID in known context (id=X, peer=X, client=X) ----
  const contextMatch = line.match(patterns.idInContext);
  if (contextMatch && isValidRustdeskId(contextMatch[1])) {
    return {
      type: 'peer_activity',
      timestamp,
      peerId: contextMatch[1],
      ip: extractIPFromLine(line),
      raw: line,
    };
  }

  // ---- 7. register_pk (IP only — no ID on server side) ----
  const pkMatch = line.match(patterns.registerPkIpOnly);
  if (pkMatch) {
    return {
      type: 'tcp_connection', // Just an IP sighting, no peer ID
      timestamp,
      ip: pkMatch[1],
      port: parseInt(pkMatch[2], 10),
      raw: line,
    };
  }

  return null;
}
