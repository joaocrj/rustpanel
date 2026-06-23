// =============================================================
// RustPanel Agent - Docker Log Stream (v2)
// Uses Docker API to stream container logs
// =============================================================

import Docker from 'dockerode';
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
   * Captures the last 200 lines of existing logs plus follows new output.
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
      logger.info(`Connected to container: ${info.Name} (${info.Id.slice(0, 12)})`);

      // Start from 60 seconds ago to catch recent events on reconnect,
      // and also tail the last 200 lines for initial context
      const sinceTimestamp = Math.floor(Date.now() / 1000) - 60;

      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        since: sinceTimestamp,
        tail: 200,
        timestamps: false,
      });

      // Track this stream for cleanup
      this.activeStreams.set(containerName, stream as unknown as NodeJS.ReadableStream);
      this.lineCounters.set(containerName, 0);

      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        let data: string;

        // Strip Docker stream header bytes if present
        // Docker multiplexes stdout/stderr with an 8-byte header:
        //   [stream_type(1)][0(3)][size(4)][payload]
        if (chunk.length > 8 && (chunk[0] === 1 || chunk[0] === 2) && chunk[1] === 0 && chunk[2] === 0 && chunk[3] === 0) {
          data = chunk.subarray(8).toString('utf-8');
        } else {
          data = chunk.toString('utf-8');
        }

        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            onLine(trimmed);
            const count = (this.lineCounters.get(containerName) || 0) + 1;
            this.lineCounters.set(containerName, count);

            // Log throughput periodically
            if (count % 500 === 0) {
              logger.info(`[${containerName}] Processed ${count} log lines`);
            }
          }
        }
      });

      stream.on('error', (err: Error) => {
        logger.error(`Stream error for ${containerName}: ${err.message}`);
      });

      stream.on('end', () => {
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
