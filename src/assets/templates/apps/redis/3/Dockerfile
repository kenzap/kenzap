# Use the official Redis image as the base
FROM redis:latest

# Create a persistent data directory
VOLUME /data

# Expose the port that Redis is running on (default: 6379)
EXPOSE 6379

# Run the application
CMD ["redis-server",  "--appendonly", "yes"]