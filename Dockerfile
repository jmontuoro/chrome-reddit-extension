# Use a base image that includes Python and gsutil
FROM google/cloud-sdk:slim

WORKDIR /app

# Install Python (already available in image, but just in case)
RUN apt-get update && apt-get install -y python3 python3-pip

# Download model from GCS
RUN mkdir -p /app/bias_model && \
    gsutil cp gs://reddit-bias-model/bias_model/model_t2835ru3/* /app/bias_model/

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy app code
COPY . .

ENV PORT=8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "main:app"]
