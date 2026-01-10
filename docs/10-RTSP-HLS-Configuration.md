# RTSP/HLS Camera Streaming Configuration

This document describes the environment variables for configuring RTSP-to-HLS camera streaming with automatic health monitoring and recovery.

## Overview

The server includes built-in RTSP-to-HLS transcoding using ffmpeg, which converts RTSP camera streams to HLS format for playback in web browsers. The system includes automatic health monitoring, failure detection, and recovery mechanisms to ensure reliable video playback.

## Basic RTSP/HLS Configuration

### Core Settings

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `RTSP_HLS_DIR` | `server/data/hls` | - | Directory for HLS output files |
| `RTSP_HLS_SEGMENT_SECONDS` | `2` | 1-6 | Duration of each HLS segment in seconds |
| `RTSP_HLS_LIST_SIZE` | `6` | 3-20 | Number of segments to keep in playlist |
| `RTSP_HLS_OUTPUT_FPS` | `15` | 1-60 | Output framerate (forces constant framerate) |
| `RTSP_HLS_PROBESIZE` | `10M` | - | Initial probe size for stream analysis |
| `RTSP_HLS_ANALYZEDURATION` | `10M` | - | Duration to analyze stream parameters |
| `RTSP_HLS_RTSP_TRANSPORT` | `tcp` | tcp/udp | RTSP transport protocol (TCP is recommended) |
| `RTSP_HLS_STARTUP_TIMEOUT_MS` | `15000` | 2000-60000 | Timeout for initial stream startup |
| `RTSP_HLS_DEBUG` | `false` | - | Enable debug output for ffmpeg |
| `FFMPEG_PATH` | `ffmpeg` | - | Path to ffmpeg binary |

## Health Monitoring & Auto-Recovery

The system includes automatic health monitoring that detects and recovers from various failure conditions.

### Health Check Configuration

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `RTSP_HLS_HEALTH_CHECK_INTERVAL_MS` | `10000` | 5000-60000 | How often to check stream health (milliseconds) |
| `RTSP_HLS_MAX_SEGMENT_AGE_SECONDS` | `30` | 10-300 | Delete segments older than this (seconds) |
| `RTSP_HLS_STALE_THRESHOLD_SECONDS` | `15` | 5-60 | Consider stream stale if no new segment in this time |
| `RTSP_HLS_MAX_RESTART_ATTEMPTS` | `5` | 1-20 | Maximum restart attempts before giving up |
| `RTSP_HLS_RESTART_BACKOFF_MS` | `2000` | 1000-30000 | Initial backoff between restart attempts (milliseconds) |
| `RTSP_HLS_CLEANUP_ON_SHUTDOWN` | `false` | - | Whether to delete HLS files on server shutdown |

### How Health Monitoring Works

1. **Process Monitoring**: Checks if ffmpeg process is still running
2. **Segment Detection**: Monitors for new segment files being created
3. **Staleness Detection**: Detects when segments stop being updated
4. **Automatic Restart**: Restarts failed or stalled streams with exponential backoff
5. **Segment Cleanup**: Removes old segments to prevent disk space issues

### Health Status States

- **starting**: Stream is initializing (waiting for first segments)
- **healthy**: Stream is running and producing new segments
- **stale**: Stream exists but no new segments within threshold
- **dead**: ffmpeg process has exited
- **restarting**: Stream is being automatically restarted

### Restart Behavior

When a stream fails or stalls:

1. The health monitor detects the issue
2. System waits for the configured backoff period
3. Attempts to restart the stream
4. Backoff period doubles on each retry (exponential backoff)
5. After max attempts, stream status becomes "dead" and automatic restarts stop
6. Restart counter resets after successful streaming period

## Health Monitoring API

### GET /api/hls/health

Returns health status for all active HLS streams.

**Example Response:**
```json
{
  "ok": true,
  "summary": {
    "totalStreams": 2,
    "healthy": 1,
    "stale": 0,
    "dead": 0,
    "starting": 1,
    "restarting": 0
  },
  "streams": {
    "camera1": {
      "healthStatus": "healthy",
      "ffmpegRunning": true,
      "uptime": 45000,
      "uptimeSeconds": 45,
      "startedAt": "2026-01-10T18:00:00.000Z",
      "lastSegmentTime": "2026-01-10T18:00:43.000Z",
      "lastSegmentAgeSeconds": 2,
      "restartAttempts": 0,
      "totalRestarts": 0,
      "currentBackoffMs": 2000,
      "maxRestartAttempts": 5,
      "lastError": null
    }
  },
  "config": {
    "healthCheckIntervalMs": 10000,
    "maxSegmentAgeSeconds": 30,
    "staleThresholdSeconds": 15,
    "maxRestartAttempts": 5,
    "restartBackoffMs": 2000,
    "cleanupOnShutdown": false
  }
}
```

## Example Configurations

### Production (Reliable)
```bash
# Conservative settings for maximum reliability
export RTSP_HLS_HEALTH_CHECK_INTERVAL_MS=10000
export RTSP_HLS_STALE_THRESHOLD_SECONDS=20
export RTSP_HLS_MAX_RESTART_ATTEMPTS=10
export RTSP_HLS_RESTART_BACKOFF_MS=3000
export RTSP_HLS_RTSP_TRANSPORT=tcp
```

### Low Latency (Fast but less reliable)
```bash
# Aggressive settings for minimum latency
export RTSP_HLS_SEGMENT_SECONDS=1
export RTSP_HLS_LIST_SIZE=3
export RTSP_HLS_HEALTH_CHECK_INTERVAL_MS=5000
export RTSP_HLS_STALE_THRESHOLD_SECONDS=5
export RTSP_HLS_RTSP_TRANSPORT=udp
```

### High Reliability (Aggressive recovery)
```bash
# Maximum recovery attempts with frequent health checks
export RTSP_HLS_HEALTH_CHECK_INTERVAL_MS=5000
export RTSP_HLS_MAX_RESTART_ATTEMPTS=20
export RTSP_HLS_RESTART_BACKOFF_MS=1000
export RTSP_HLS_STALE_THRESHOLD_SECONDS=10
export RTSP_HLS_MAX_SEGMENT_AGE_SECONDS=60
```

## Graceful Shutdown

The server handles SIGTERM and SIGINT signals gracefully:

1. Stops health monitoring
2. Terminates all ffmpeg processes
3. Optionally cleans up HLS directories (if `RTSP_HLS_CLEANUP_ON_SHUTDOWN=true`)
4. Closes server connections
5. Exits cleanly

## Troubleshooting

### Streams keep restarting
- Increase `RTSP_HLS_STALE_THRESHOLD_SECONDS` if network is slow
- Check camera RTSP URL is valid and accessible
- Verify ffmpeg is installed and working: `ffmpeg -version`
- Enable debug mode: `RTSP_HLS_DEBUG=true`

### Segments not being cleaned up
- Check `RTSP_HLS_MAX_SEGMENT_AGE_SECONDS` is set appropriately
- Verify disk space is available
- Check file permissions on HLS directory

### High restart count
- Camera may be unstable - check camera logs
- Network issues between server and camera
- Consider increasing restart backoff: `RTSP_HLS_RESTART_BACKOFF_MS=5000`

### Stale segments after ffmpeg crash
- Enable cleanup on shutdown: `RTSP_HLS_CLEANUP_ON_SHUTDOWN=true`
- Automatic cleanup runs during health checks
- Stale segments older than `RTSP_HLS_MAX_SEGMENT_AGE_SECONDS` are automatically removed

## Monitoring Integration

The `/api/hls/health` endpoint can be integrated with monitoring systems:

- **Prometheus**: Scrape endpoint and alert on unhealthy streams
- **Uptime monitors**: Check `summary.healthy` vs `summary.totalStreams`
- **Dashboard**: Display real-time stream health status
- **Alerting**: Trigger alerts when `restartAttempts` is high or status is "dead"
