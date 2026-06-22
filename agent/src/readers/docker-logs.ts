// =============================================================
// RustPanel Agent - Docker Log Stream
// Uses Docker API to stream container logs
// =============================================================

import Docker from 'dockerode';
import { logger } from '../utils/logger.js';

export class DockerLogStream {
  private docker: Docker;
  private abortControllers: Map<string, AbortController> = new Map();

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
  }

  /**
   * Stream logs from a Docker container, calling onLine for each new line.
   * Only follows new logs (since now).
   */
  async streamLogs(
    containerName: string,
    onLine: (line: string) => void
  ): Promise<void> {
    try {
      const container = this.docker.getContainer(containerName);
      const info = await container.inspect();
      logger.info(`Connected to container: ${info.Name} (${info.Id.slice(0, 12)})`);

      const stream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
        since: Math.floor(Date.now() / 1000),
        timestamps: false,
      });

      let buffer = '';

      stream.on('data', (chunk: Buffer) => {
        // Docker stream multiplexing: first 8 bytes are header
        // STREAM_TYPE(1) + 0(3) + SIZE(4)
        let data = chunk.toString('utf-8');

        // Strip Docker stream header bytes if present
        // Header is: [stream_type, 0, 0, 0, size1, size2, size3, size4]
        if (chunk.length > 8 && (chunk[0] === 1 || chunk[0] === 2)) {
          data = chunk.subarray(8).toString('utf-8');
        }

        buffer += data;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            onLine(trimmed);
          }
        }
      });

      stream.on('error', (err: Error) => {
        logger.error(`Stream error for ${containerName}: ${err.message}`);
      });

      stream.on('end', () => {
        logger.warn(`Stream ended for ${containerName}, will attempt reconnect...`);
        // Retry after 5 seconds
        setTimeout(() => {
          this.streamLogs(containerName, onLine).catch((e) =>
            logger.error(`Reconnect failed for ${containerName}: ${e}`)
          );
        }, 5000);
      });
    } catch (error) {
      logger.error(`Failed to stream logs from ${containerName}: ${error}`);
      // Retry after 10 seconds
      setTimeout(() => {
        this.streamLogs(containerName, onLine).catch((e) =>
          logger.error(`Reconnect failed for ${containerName}: ${e}`)
        );
      }, 10000);
    }
  }

  async stop() {
    for (const [name, controller] of this.abortControllers) {
      controller.abort();
      logger.info(`Stopped streaming ${name}`);
    }
    this.abortControllers.clear();
  }
}
