// =============================================================
// RustPanel Agent - Docker Log Stream (v3)
// Uses Docker API to stream container logs
// =============================================================
//
// IMPORTANT: Docker log streams use a multiplexed format when
// tty=false (standard for server containers). Each "frame" has:
//   [stream_type(1)][0][0][0][size(4 bytes, big-endian)][payload]
//
// A single "data" event chunk can contain MULTIPLE frames.
// The v2 code only stripped the header of the first frame,
// corrupting all subsequent frames in the same chunk.
//
// Fix: use docker.modem.demuxStream() which correctly splits
// the multiplexed stream into separate stdout/stderr PassThroughs.
// =============================================================

import Docker from 'dockerode';
import { PassThrough } from 'node:stream';
import { logger } from '../utils/logger.js';

export class DockerLogStream {
  private docker: Docker;
  private activeStreams: Map<string, NodeJS.ReadableStream> = new Map();
  private lineCounters: Map<string, number> = new Map();
  private _stopped = false;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  /**
   * Helper to find container ID by exact name or partial prefix/containment match.
   * Crucial for Docker Swarm where container names are dynamic (e.g. rustdesk_hbbs.1.xxxx).
   */
  private async findContainerId(searchName: string): Promise<string> {
    const containers = await this.docker.listContainers({ all: false });

    // 1. Try exact match (leading slash is added by Docker daemon in Name)
    const exactMatch = containers.find(c =>
      c.Names.some(name => name === `/${searchName}` || name === searchName)
    );
    if (exactMatch) return exactMatch.Id;

    // 2. Try prefix/containment match (e.g. "rustdesk_hbbs.1.xxx" matches "hbbs")
    const partialMatch = containers.find(c =>
      c.Names.some(name => name.includes(searchName))
    );
    if (partialMatch) return partialMatch.Id;

    throw new Error(`no running container matches name or prefix "${searchName}"`);
  }

  /**
   * Stream logs from a Docker container, calling onLine for each new line.
   * Uses docker.modem.demuxStream() to correctly parse the multiplexed
   * Docker log format — critical for proper multi-frame chunk handling.
   */
  async streamLogs(
    containerName: string,
    onLine: (line: string) => void
  ): Promise<void> {
    if (this._stopped) return;

    try {
      logger.info(`Searching for container matching "${containerName}"...`);
      const containerId = await this.findContainerId(containerName);
      const container = this.docker.getContainer(containerId);
      const info = await container.inspect();
      const isTty = info.Config.Tty;
      logger.info(`Connected to container: ${info.Name} (${info.Id.slice(0, 12)}) [TTY: ${isTty}]`);

      // Capture the last 24 hours of logs + tail 10000 lines for initial context.
      // This ensures we backfill peer IP mappings from recent registrations on agent start/restart.
      const sinceTimestamp = Math.floor(Date.now() / 1000) - 86400;

      const rawStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        since: sinceTimestamp,
        tail: 10000,
        timestamps: false,
      });

      const stdout = new PassThrough();
      const stderr = new PassThrough();

      if (isTty) {
        // If TTY is enabled, the log stream is raw text (not multiplexed).
        // We can pipe it directly.
        rawStream.pipe(stdout);
      } else {
        // If TTY is disabled, the log stream is multiplexed.
        // We must demultiplex it using demuxStream.
        (this.docker as any).modem.demuxStream(rawStream, stdout, stderr);
      }

      this.activeStreams.set(containerName, rawStream as unknown as NodeJS.ReadableStream);
      this.lineCounters.set(containerName, 0);

      let buffer = '';
      let firstLineReceived = false;

      const processChunk = (chunk: Buffer) => {
        buffer += chunk.toString('utf-8');
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            if (!firstLineReceived) {
              firstLineReceived = true;
              logger.info(`[${containerName}] First log line received — stream is healthy`);
            }
            onLine(trimmed);
            const count = (this.lineCounters.get(containerName) || 0) + 1;
            this.lineCounters.set(containerName, count);

            // Log throughput periodically
            if (count % 500 === 0) {
              logger.info(`[${containerName}] Processed ${count} log lines`);
            }
          }
        }
      };

      stdout.on('data', processChunk);
      stderr.on('data', processChunk);

      stdout.on('error', (err: Error) => {
        logger.error(`Stream error for ${containerName} (stdout): ${err.message}`);
      });
      stderr.on('error', (err: Error) => {
        logger.error(`Stream error for ${containerName} (stderr): ${err.message}`);
      });

      // Watch the raw stream for end/error to trigger reconnect
      (rawStream as any).on('error', (err: Error) => {
        logger.error(`Raw stream error for ${containerName}: ${err.message}`);
      });

      (rawStream as any).on('end', () => {
        if (this._stopped) return;
        const total = this.lineCounters.get(containerName) || 0;
        logger.warn(`Stream ended for ${containerName} (${total} lines processed), will attempt reconnect...`);
        this.activeStreams.delete(containerName);
        setTimeout(() => {
          this.streamLogs(containerName, onLine).catch((e) =>
            logger.error(`Reconnect failed for ${containerName}: ${e}`)
          );
        }, 5000);
      });
    } catch (error) {
      logger.error(`Failed to stream logs from ${containerName}: ${(error as Error).message || error}`);
      if (this._stopped) return;
      // Retry after 10 seconds
      setTimeout(() => {
        this.streamLogs(containerName, onLine).catch((e) =>
          logger.error(`Reconnect failed for ${containerName}: ${e}`)
        );
      }, 10000);
    }
  }

  async stop() {
    this._stopped = true;
    for (const [name, stream] of this.activeStreams) {
      try {
        (stream as any).destroy?.();
      } catch {
        // Ignore cleanup errors
      }
      logger.info(`Stopped streaming ${name}`);
    }
    this.activeStreams.clear();
  }
}
