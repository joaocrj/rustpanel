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
  // General peer ID detection in registration messages
  registerPk: /register_pk.*?id[=:\s]+["']?(\d{5,})/i,
  // New peer detection from update_addr
  updateAddr: /update_addr.*?(\d{5,})/i,
  // Timestamp extraction
  timestamp: /\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[\d.]*\s*[+-]?\d{0,4})\]/,
};

export function parseHbbsLine(line: string): HbbsEvent | null {
  if (!line || line.trim().length === 0) return null;

  const tsMatch = line.match(patterns.timestamp);
  const timestamp = tsMatch ? new Date(tsMatch[1]) : new Date();

  // Peer registration
  const registerMatch = line.match(patterns.peerRegister);
  if (registerMatch) {
    return {
      type: 'peer_register',
      timestamp,
      peerId: registerMatch[1],
      ip: cleanIP(registerMatch[2]),
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
