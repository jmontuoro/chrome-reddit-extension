# Fixed Dockerfile - matches runtime.txt Python version
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

# Install pip dependencies early (for better caching)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .

# Create model cache directory
RUN mkdir -p /tmp/bias_model

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Expose port for Flask
EXPOSE 8080

# Use gunicorn for production
CMD ["gunicorn", "-b", "0.0.0.0:8080", "--timeout", "120", "main:app"]