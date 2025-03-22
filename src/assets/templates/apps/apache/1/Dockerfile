# Use the official Alpine Linux as the base image
FROM alpine:latest

# Update the package list and install Apache
RUN apk update && \
    apk add --no-cache apache2

# Copy a custom HTML file to replace the default Apache page
COPY index.html /var/www/localhost/htdocs/index.html

# Expose port 80 for HTTP traffic
EXPOSE 80

# Start Apache when the container runs
CMD ["httpd", "-D", "FOREGROUND"]