# Use the official Alpine Linux as the base image
FROM alpine:latest

# Update the package list and install Nginx
RUN apk update && \
    apk add --no-cache nginx

# Create a directory for Nginx logs
RUN mkdir -p /var/log/nginx

# Copy a custom HTML file to replace the default Nginx page
COPY index.html /usr/share/nginx/html/index.html

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Nginx when the container runs
CMD ["nginx", "-g", "daemon off;"]