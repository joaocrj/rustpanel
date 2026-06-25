// =============================================================
// RustPanel Agent - HBBR Parser Unit Tests
// =============================================================
// Run: npx tsx src/parsers/__tests__/hbbr-parser.test.ts
// =============================================================

import { parseHbbrLine, resetHbbrParserState } from '../hbbr-parser.js';

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

// Pro/Modern: New relay request
const PRO_RELAY_REQUEST =
    '[2024-01-15 10:30:45.123 +0000] INFO New relay request abc123-def456-ghi789 from [::ffff:203.0.113.5]:12345';

// OSS: Relayrequest (no space)
const OSS_RELAY_REQUEST =
    '[2024-01-15 10:30:45.123 +0000] INFO Relayrequest xyz789-uvw456-rst123 from [::ffff:198.51.100.10]:54321';

// OSS: Relay request: (simple)
const OSS_RELAY_REQUEST_SIMPLE =
    '[2024-01-15 10:30:45.123 +0000] INFO Relay request: relay-uuid-001 from 192.168.1.100';

// Pro/Modern: got paired
const PRO_RELAY_PAIRED =
    '[2024-01-15 10:30:46.123 +0000] INFO Relay request abc123-def456-ghi789 from [::ffff:203.0.113.5]:12345 got paired';

// OSS: Relayrequest ... got paired (no space)
const OSS_RELAY_PAIRED =
    '[2024-01-15 10:30:46.123 +0000] INFO Relayrequest xyz789-uvw456-rst123 from [::ffff:198.51.100.10]:54321 got paired';

// OSS: Relay paired: (simple)
const OSS_RELAY_PAIRED_SIMPLE =
    '[2024-01-15 10:30:46.123 +0000] INFO Relay paired: relay-uuid-001 from 192.168.1.100';

// Both are raw
const BOTH_ARE_RAW = '[2024-01-15 10:30:47.123 +0000] INFO Both are raw';

// Pro/Modern: relay closed
const PRO_RELAY_CLOSED =
    '[2024-01-15 10:35:00.123 +0000] INFO Relay of [::ffff:203.0.113.5]:12345 closed';

// OSS: relay closed (simple)
const OSS_RELAY_CLOSED =
    '[2024-01-15 10:35:00.123 +0000] INFO Relay closed from 198.51.100.10';

// Edge cases
const EMPTY_LINE = '';
const GARBAGE_LINE = '[2024-01-15 10:30:45.123 +0000] Some random relay log message';

// ============================================
// Tests
// ============================================

console.log('🧪 HBBR Parser Unit Tests\n');
console.log('='.repeat(60));

// --- Relay request (Pro/Modern) ---
section('Relay request (Pro/Modern)');

resetHbbrParserState();
const result1 = parseHbbrLine(PRO_RELAY_REQUEST);
assert('Parses successfully', result1 !== null);
assert('Extracts relay_request type', result1?.type === 'relay_request', `got: ${result1?.type}`);
assert('Extracts UUID', result1?.uuid === 'abc123-def456-ghi789', `got: ${result1?.uuid}`);
assert('Extracts IP', result1?.ip === '203.0.113.5', `got: ${result1?.ip}`);
assert('Extracts port', result1?.port === 12345, `got: ${result1?.port}`);

// --- Relay request (OSS, no space) ---
section('Relay request (OSS, "Relayrequest")');

const result2 = parseHbbrLine(OSS_RELAY_REQUEST);
assert('Parses successfully', result2 !== null);
assert('Extracts relay_request type', result2?.type === 'relay_request');
assert('Extracts UUID', result2?.uuid === 'xyz789-uvw456-rst123', `got: ${result2?.uuid}`);
assert('Extracts IP', result2?.ip === '198.51.100.10', `got: ${result2?.ip}`);

// --- Relay request (OSS, simple) ---
section('Relay request (OSS, simple)');

const result3 = parseHbbrLine(OSS_RELAY_REQUEST_SIMPLE);
assert('Parses successfully', result3 !== null);
assert('Extracts relay_request type', result3?.type === 'relay_request');
assert('Extracts UUID', result3?.uuid === 'relay-uuid-001', `got: ${result3?.uuid}`);
assert('Extracts IP', result3?.ip === '192.168.1.100', `got: ${result3?.ip}`);

// --- Relay paired (Pro/Modern) ---
section('Relay paired (Pro/Modern, "got paired")');

resetHbbrParserState();
const result4 = parseHbbrLine(PRO_RELAY_PAIRED);
assert('Parses successfully', result4 !== null);
assert('Extracts relay_paired type', result4?.type === 'relay_paired', `got: ${result4?.type}`);
assert('Extracts UUID', result4?.uuid === 'abc123-def456-ghi789', `got: ${result4?.uuid}`);
assert('Extracts IP', result4?.ip === '203.0.113.5', `got: ${result4?.ip}`);

// --- Relay paired (OSS, no space) ---
section('Relay paired (OSS, "Relayrequest ... got paired")');

const result5 = parseHbbrLine(OSS_RELAY_PAIRED);
assert('Parses successfully', result5 !== null);
assert('Extracts relay_paired type', result5?.type === 'relay_paired');
assert('Extracts UUID', result5?.uuid === 'xyz789-uvw456-rst123', `got: ${result5?.uuid}`);

// --- Relay paired (OSS, simple) ---
section('Relay paired (OSS, simple)');

const result6 = parseHbbrLine(OSS_RELAY_PAIRED_SIMPLE);
assert('Parses successfully', result6 !== null);
assert('Extracts relay_paired type', result6?.type === 'relay_paired');
assert('Extracts UUID', result6?.uuid === 'relay-uuid-001', `got: ${result6?.uuid}`);

// --- Both are raw ---
section('Both are raw (relay active)');

const result7 = parseHbbrLine(BOTH_ARE_RAW);
assert('Parses successfully', result7 !== null);
assert('Extracts relay_active type', result7?.type === 'relay_active', `got: ${result7?.type}`);

// --- Relay closed (Pro/Modern) ---
section('Relay closed (Pro/Modern)');

const result8 = parseHbbrLine(PRO_RELAY_CLOSED);
assert('Parses successfully', result8 !== null);
assert('Extracts relay_closed type', result8?.type === 'relay_closed', `got: ${result8?.type}`);
assert('Extracts IP', result8?.ip === '203.0.113.5', `got: ${result8?.ip}`);
assert('Extracts port', result8?.port === 12345, `got: ${result8?.port}`);

// --- Relay closed (OSS, simple) ---
section('Relay closed (OSS, simple)');

const result9 = parseHbbrLine(OSS_RELAY_CLOSED);
assert('Parses successfully', result9 !== null);
assert('Extracts relay_closed type', result9?.type === 'relay_closed', `got: ${result9?.type}`);
assert('Extracts IP', result9?.ip === '198.51.100.10', `got: ${result9?.ip}`);

// --- Edge cases ---
section('Edge cases');

const result10 = parseHbbrLine(EMPTY_LINE);
assert('Returns null for empty line', result10 === null);

const result11 = parseHbbrLine(GARBAGE_LINE);
assert('Returns null for unrecognized log line', result11 === null);

// --- Full session lifecycle ---
section('Full session lifecycle (stateful)');

resetHbbrParserState();

// 1. Request
const life1 = parseHbbrLine(PRO_RELAY_REQUEST);
assert('Lifecycle: request parsed', life1?.type === 'relay_request');
assert('Lifecycle: request UUID correct', life1?.uuid === 'abc123-def456-ghi789');

// 2. Paired
const life2 = parseHbbrLine(PRO_RELAY_PAIRED);
assert('Lifecycle: paired parsed', life2?.type === 'relay_paired');
assert('Lifecycle: paired UUID correct', life2?.uuid === 'abc123-def456-ghi789');

// 3. Active (Both are raw)
const life3 = parseHbbrLine(BOTH_ARE_RAW);
assert('Lifecycle: active parsed', life3?.type === 'relay_active');
assert('Lifecycle: active UUID carried from paired state',
    life3?.uuid === 'abc123-def456-ghi789',
    `got: ${life3?.uuid}`);

// 4. Closed
const life4 = parseHbbrLine(PRO_RELAY_CLOSED);
assert('Lifecycle: closed parsed', life4?.type === 'relay_closed');
assert('Lifecycle: closed IP correct', life4?.ip === '203.0.113.5');

// --- Summary ---
console.log(`\n${'='.repeat(60)}`);
console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) {
    console.log('\n❌ SOME TESTS FAILED');
    process.exit(1);
} else {
    console.log('\n✅ ALL TESTS PASSED');
}