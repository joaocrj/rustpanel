// =============================================================
// RustPanel Agent - HBBS Log Parser
// =============================================================

import { logger } from '../utils/logger.js';

export interface HbbsEvent {
  type: 'peer_register' | 'tcp_connection' | 'rendezvous_request' | 'unknown';
  timestamp: Date;
  peerId?: string;
  ip?: string;
  port?: number;
  raw: string;
}

// Regex patterns for HBBS log lines
const patterns = {
  // [TIMESTAMP] DEBUG [src/server.rs:45] Registering client: ID=<ID>, IP=<IP>
  peerRegister: /Registering client:\s*ID=(\S+),?\s*IP=(\S+)/i,
  // [TIMESTAMP] DEBUG Tcp connection from <IP>:<PORT>, ws: <bool>
  tcpConnection: /Tcp connection from \[?::ffff:?([\d.]+)\]?:(\d+)/i,
  // General peer ID detection in registration messages (relaxed to match plain register_pk)
  registerPk: /register_pk.*?(\d{5,})/i,
  // New peer detection from update_addr
  updateAddr: /update_addr.*?(\d{5,})/i,
  // Timestamp extraction
  timestamp: /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\d.]*\s*[+-]?\d{0,4})\]/,
};

/**
 * Extracts public IPv4 from a log line if present
 */
function extractIP(line: string): string | undefined {
  // Match standard IPv4 addresses, avoiding timestamps (which contain dashes/periods)
  // Look for IPv4 with port or within brackets like ::ffff:1.2.3.4
  const ipv4Match = line.match(/(?:\[?::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\]?(?::\d+)?/);
  if (ipv4Match) return ipv4Match[1];
  return undefined;
}

export function parseHbbsLine(line: string): HbbsEvent | null {
  if (!line || line.trim().length === 0) return null;

  const tsMatch = line.match(patterns.timestamp);
  const timestamp = tsMatch ? new Date(tsMatch[1]) : new Date();
  
  const extractedIp = extractIP(line);

  // Peer registration
  const registerMatch = line.match(patterns.peerRegister);
  if (registerMatch) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: registerMatch[1],
      ip: cleanIP(registerMatch[2]) || extractedIp,
      raw: line,
    };
  }

  // TCP connection
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

  // Register PK (public key)
  const pkMatch = line.match(patterns.registerPk);
  if (pkMatch) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: pkMatch[1],
      ip: extractedIp,
      raw: line,
    };
  }

  // Update addr
  const addrMatch = line.match(patterns.updateAddr);
  if (addrMatch) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: addrMatch[1],
      ip: extractedIp,
      raw: line,
    };
  }

  return null;
}

function cleanIP(ip: string): string {
  return ip
    .replace(/^\[?::ffff:/i, '')
    .replace(/\]$/, '')
    .replace(/:\d+$/, '');
}
