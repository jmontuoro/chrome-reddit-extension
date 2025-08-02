FROM python:3.10-slim

WORKDIR /app

# Install gcloud SDK to get gsutil
RUN apt-get update && apt-get install -y curl gnupg apt-transport-https ca-certificates && \
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] http://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list && \
    curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | apt-key add - && \
    apt-get update && apt-get install -y google-cloud-sdk && \
    rm -rf /var/lib/apt/lists/*

# ⬇️ Download model early so it becomes its own cached layer
RUN mkdir -p /app/bias_model && \
    gsutil cp gs://reddit-bias-model/bias_model/model_t2835ru3/* /app/bias_model/

# ✅ Install dependencies (cached if requirements.txt doesn’t change)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ✅ Copy rest of the app (code changes won’t invalidate model/download layer)
COPY . .

ENV PORT=8080
CMD ["gunicorn", "-b", "0.0.0.0:8080", "main:app"]
