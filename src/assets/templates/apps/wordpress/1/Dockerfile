# Stage 1: Build WordPress
FROM wordpress:latest AS wordpress-build
# Set environment variables for WordPress configuration
ENV WORDPRESS_DB_HOST=db
ENV WORDPRESS_DB_USER=wordpress
ENV WORDPRESS_DB_PASSWORD=wordpress
ENV WORDPRESS_DB_NAME=wordpress
# Expose port 80 for WordPress
EXPOSE 80

# Stage 2: Build MySQL
FROM mysql:8.0 AS mysql-build
# Set environment variables for MySQL configuration
ENV MYSQL_ROOT_PASSWORD=wordpress_root
ENV MYSQL_DATABASE=wordpress
ENV MYSQL_USER=wordpress
ENV MYSQL_PASSWORD=wordpress
# Copy a custom SQL script to initialize the database
# COPY init.sql /docker-entrypoint-initdb.d/
# Expose port 3306 for MySQL
EXPOSE 3306

# Stage 3: Final Stage (Combining WordPress and MySQL)
FROM alpine:latest AS final
# Copy WordPress files from the wordpress-build stage
COPY --from=wordpress-build /var/www/html /var/www/html
# Initialize MySQL data directory
RUN apk update && \
    apk add --no-cache apache2 mariadb mariadb-client && \
    mkdir -p /run/mysqld /var/lib/mysql && \
    chown -R mysql:mysql /run/mysqld /var/lib/mysql && \
    mysql_install_db --user=mysql --datadir=/var/lib/mysql
# Start Apache and MariaDB (this is just an example; not recommended for production)
CMD ["sh", "-c", "echo 'ServerName localhost' >> /etc/apache2/httpd.conf && httpd -D FOREGROUND & /usr/bin/mariadbd --user=mysql --datadir=/var/lib/mysql"]
# Start Apache and MySQL (this is just an example; not recommended for production)
# CMD ["sh", "-c", "httpd -D FOREGROUND & mysqld --user=mysql"]