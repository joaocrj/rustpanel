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

  async streamLogs(
    containerName: string,
    onLine: (line: string) => void
  ): Promise<void> {
    try {
      logger.info(`Searching for container matching "${containerName}"...`);
      const containerId = await this.findContainerId(containerName);
      const container = this.docker.getContainer(containerId);
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
        let data = chunk.toString('utf-8');

        // Strip Docker stream header bytes if present
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
        setTimeout(() => {
          this.streamLogs(containerName, onLine).catch((e) =>
            logger.error(`Reconnect failed for ${containerName}: ${e}`)
          );
        }, 5000);
      });
    } catch (error) {
      logger.error(`Failed to stream logs from ${containerName}: ${(error as Error).message || error}`);
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
