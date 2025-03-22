# Use the official OpenJDK image as the base
FROM openjdk:21-jdk-slim

# Set the working directory inside the container
WORKDIR /app

# Copy the built application JAR file (assuming it's named app.jar)
COPY build/libs/app.jar app.jar

# Expose the port that Ktor is running on (default: 8080)
EXPOSE 8080

# Run the application
CMD ["java", "-jar", "app.jar"]