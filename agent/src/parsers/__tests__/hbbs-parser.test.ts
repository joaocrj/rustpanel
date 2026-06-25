// =============================================================
// RustPanel Agent - HBBS Parser Unit Tests
// =============================================================
// Run: npx tsx src/parsers/__tests__/hbbs-parser.test.ts
// =============================================================

import { parseHbbsLine } from '../hbbs-parser.js';

let passed = 0;
let failed = 0;

function assert(description: string, condition: boolean, details?: string) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${description}`);
    } else {
        failed++;
        console.log(`  ❌ ${description}${details ? ` — ${details}` : ''}`);
    }
}

function section(name: string) {
    console.log(`\n📋 ${name}`);
}

// ============================================
// Test Data
// ============================================

// OSS format with update_pk
const OSS_UPDATE_PK = 'rustdesk_hbbs.1.m9kg9k85mvib@JoaoCRJPortainer    | [2026-06-20 03:20:05.311813 +00:00] INFO [src/peer.rs:102] update_pk 206524240 [::ffff:201.76.164.174]:54855 b"a8ad4232-fca5-4c3d-a4cb-2f0c7785c12e"';

// OSS update_pk without ::ffff: prefix
const OSS_UPDATE_PK_PLAIN = '[2026-06-20 03:20:05.311813 +00:00] INFO [src/peer.rs:102] update_pk 123456789 192.168.1.100:21116';

// Legacy registration
const LEGACY_REGISTER = '[2024-01-15 10:30:45.123 +0000] INFO Registering client: ID=987654321, IP=203.0.113.5';

// TCP connection (no ID)
const TCP_CONNECTION = '[2024-01-15 10:30:45.123 +0000] INFO Tcp connection from ::ffff:198.51.100.10:12345';

// IP change
const IP_CHANGE = '[2024-01-15 10:30:45.123 +0000] INFO IP change of 555666777 from ::ffff:10.0.0.1:21116 to ::ffff:172.16.0.1:21116';

// update_addr
const UPDATE_ADDR = '[2024-01-15 10:30:45.123 +0000] INFO update_addr: 111222333, addr: ::ffff:192.0.2.1:21116';

// punch_hole
const PUNCH_HOLE = '[2024-01-15 10:30:45.123 +0000] INFO punch_hole request from 444555666 to 777888999';

// handle_udp
const HANDLE_UDP = '[2024-01-15 10:30:45.123 +0000] INFO 888999000 from ::ffff:198.18.0.1:21116';

// register_pk (IP only, no ID)
const REGISTER_PK = '[2024-01-15 10:30:45.123 +0000] INFO register_pk: ::ffff:203.0.113.50:21116';

// Edge cases
const EMPTY_LINE = '';
const WHITESPACE_LINE = '   ';
const GARBAGE_LINE = '[2024-01-15 10:30:45.123 +0000] Some random log message';

// ============================================
// Tests
// ============================================

console.log('🧪 HBBS Parser Unit Tests\n');
console.log('='.repeat(60));

// --- update_pk ---
section('update_pk (OSS main event)');

const result1 = parseHbbsLine(OSS_UPDATE_PK);
assert('Parses successfully', result1 !== null);
assert('Extracts peer_register type', result1?.type === 'peer_register', `got: ${result1?.type}`);
assert('Extracts correct peer ID', result1?.peerId === '206524240', `got: ${result1?.peerId}`);
assert('Extracts correct IP', result1?.ip === '201.76.164.174', `got: ${result1?.ip}`);
assert('Extracts correct port', result1?.port === 54855, `got: ${result1?.port}`);

// --- update_pk plain ---
section('update_pk (plain IP, no ::ffff:)');

const result2 = parseHbbsLine(OSS_UPDATE_PK_PLAIN);
assert('Parses successfully', result2 !== null);
assert('Extracts peer ID', result2?.peerId === '123456789', `got: ${result2?.peerId}`);
assert('Extracts IP', result2?.ip === '192.168.1.100', `got: ${result2?.ip}`);

// --- Legacy register ---
section('Legacy registration');

const result3 = parseHbbsLine(LEGACY_REGISTER);
assert('Parses successfully', result3 !== null);
assert('Extracts peer_register type', result3?.type === 'peer_register');
assert('Extracts peer ID', result3?.peerId === '987654321', `got: ${result3?.peerId}`);
assert('Extracts IP', result3?.ip === '203.0.113.5', `got: ${result3?.ip}`);

// --- TCP connection ---
section('TCP connection (IP only, no ID)');

const result4 = parseHbbsLine(TCP_CONNECTION);
assert('Parses successfully', result4 !== null);
assert('Extracts tcp_connection type', result4?.type === 'tcp_connection', `got: ${result4?.type}`);
assert('Extracts correct IP', result4?.ip === '198.51.100.10', `got: ${result4?.ip}`);
assert('Extracts correct port', result4?.port === 12345, `got: ${result4?.port}`);
assert('Has no peerId', result4?.peerId === undefined, `got: ${result4?.peerId}`);

// --- IP change ---
section('IP change');

const result5 = parseHbbsLine(IP_CHANGE);
assert('Parses successfully', result5 !== null);
assert('Extracts peer_register type', result5?.type === 'peer_register');
assert('Extracts peer ID', result5?.peerId === '555666777', `got: ${result5?.peerId}`);
assert('Extracts new IP', result5?.ip === '172.16.0.1', `got: ${result5?.ip}`);

// --- update_addr ---
section('update_addr');

const result6 = parseHbbsLine(UPDATE_ADDR);
assert('Parses successfully', result6 !== null);
assert('Extracts peer_register type', result6?.type === 'peer_register');
assert('Extracts peer ID', result6?.peerId === '111222333', `got: ${result6?.peerId}`);
assert('Extracts IP', result6?.ip === '192.0.2.1', `got: ${result6?.ip}`);

// --- punch_hole ---
section('punch_hole');

const result7 = parseHbbsLine(PUNCH_HOLE);
assert('Parses successfully', result7 !== null);
assert('Extracts peer_activity type', result7?.type === 'peer_activity', `got: ${result7?.type}`);
assert('Extracts source peer ID', result7?.peerId === '444555666', `got: ${result7?.peerId}`);

// --- handle_udp ---
section('handle_udp (ID from IP:PORT)');

const result8 = parseHbbsLine(HANDLE_UDP);
assert('Parses successfully', result8 !== null);
assert('Extracts peer_register type', result8?.type === 'peer_register');
assert('Extracts peer ID', result8?.peerId === '888999000', `got: ${result8?.peerId}`);
assert('Extracts IP', result8?.ip === '198.18.0.1', `got: ${result8?.ip}`);

// --- register_pk (IP only) ---
section('register_pk (IP only)');

const result9 = parseHbbsLine(REGISTER_PK);
assert('Parses successfully', result9 !== null);
assert('Extracts tcp_connection type', result9?.type === 'tcp_connection', `got: ${result9?.type}`);
assert('Extracts IP', result9?.ip === '203.0.113.50', `got: ${result9?.ip}`);
assert('Has no peerId', result9?.peerId === undefined);

// --- Edge cases ---
section('Edge cases');

const result10 = parseHbbsLine(EMPTY_LINE);
assert('Returns null for empty line', result10 === null);

const result11 = parseHbbsLine(WHITESPACE_LINE);
assert('Returns null for whitespace-only line', result11 === null);

const result12 = parseHbbsLine(GARBAGE_LINE);
assert('Returns null for unrecognized log line', result12 === null);

// --- Port filtering ---
section('Port number filtering (should not be parsed as IDs)');

const fakePortLog = '[2024-01-15 10:30:45.123 +0000] INFO update_pk 21116 [::ffff:10.0.0.1]:54321';
const result13 = parseHbbsLine(fakePortLog);
assert('Rejects port 21116 as peer ID', result13 === null, '21116 is a known RustDesk port, not a valid peer ID');

// --- Summary ---
console.log(`\n${'='.repeat(60)}`);
console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
} else {
    console.log('\n✅ ALL TESTS PASSED');
}