# Use a lightweight base Python image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install pip dependencies early (for better caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .

# Expose port for Flask
ENV PORT=8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "main:app"]
