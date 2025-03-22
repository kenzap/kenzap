# Use the official Redis image as the base
FROM redis:latest

# Copy custom configuration
COPY redis.conf /usr/local/etc/redis/redis.conf

# Expose the port that Redis is running on (default: 6379)
EXPOSE 6379

# Run the application
CMD ["redis-server", "/usr/local/etc/redis/redis.conf"]