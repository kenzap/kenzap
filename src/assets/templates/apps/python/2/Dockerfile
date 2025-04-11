# Use the official Python image from Docker Hub
FROM python:3.13-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY _ .

# Expose the port the app runs on
EXPOSE 5000

# Set environment variable for Flask auto-reload
ENV FLASK_ENV=development

# Command to run the Python script
CMD ["flask", "--app", "app.py", "--debug", "run", "--host=0.0.0.0"]