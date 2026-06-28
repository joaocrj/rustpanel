# Multi-stage build for rustpanel-udp-capture
# Build stage
FROM rust:1.88-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    musl-dev \
    libpcap-dev \
    linux-headers \
    pkgconfig \
    openssl-dev \
    openssl-libs-static

WORKDIR /app

# Copy Cargo files first for better caching
COPY Cargo.toml Cargo.lock ./

# Copy actual source
COPY src ./src

# Build the actual application (fail fast on error)
RUN cargo build --release

# Runtime stage
FROM alpine:3.20 AS runtime

# Install runtime dependencies
RUN apk add --no-cache \
    libpcap \
    libgcc \
    libstdc++ \
    ca-certificates \
    tzdata

# Create non-root user
RUN addgroup -g 1000 -S rustpanel && \
    adduser -u 1000 -S rustpanel -G rustpanel

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/rustpanel-udp-capture /usr/local/bin/rustpanel-udp-capture

# Verify binary exists and is executable
RUN ls -la /usr/local/bin/rustpanel-udp-capture && \
    /usr/local/bin/rustpanel-udp-capture --help || true

# Create config directory
RUN mkdir -p /etc/rustpanel-udp-capture && \
    chown -R rustpanel:rustpanel /etc/rustpanel-udp-capture

# Switch to non-root user
USER rustpanel

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD pgrep -f rustpanel-udp-capture > /dev/null || exit 1

# Entrypoint
ENTRYPOINT ["rustpanel-udp-capture"]