# AICH

## Introduction

This is a NestJS backend project powered by a Large Language Model designed to assist bookkeepers and accountants in performing their tasks more efficiently. It includes the following features:

- AI-Enhanced Accounting Assistant: Powered by LLAMA 3.1 with Retrieval-Augmented Generation (RAG) via LangChain, this specialized agent focuses on accounting and bookkeeping tasks.
- Cognitive Accounting Automation Module: Automates the extraction of basic information from invoices and receipts, transforming them into accounting vouchers.

## Installation

### Ollama Setup

1. Pleas make sure you have the following installed:
   - [CUDA driversDocker](https://developer.nvidia.com/cuda-downloads?target_os=Linux), Use the following command to check if you have installed the drivers:
   ```
   nvidia-smi
   ```
2. If you want to read official Ollama documentation, please visit [Ollama](https://github.com/ollama/ollama)

3. Linux user use follow command to install Ollama:

   ```
   curl -fsSL https://ollama.com/install.sh | sh
   ```

4. If you want ollama to be access by non local IP, You can add following content into `/etc/ollama/config.yaml`:

   ```
   sudo vim /etc/systemd/system/ollama.service
   ```

   - Add following content to the file:

   ```
   [Service]
   Environment="OLLAMA_HOST=0.0.0.0"
   ```

   - Restart Ollama

   ```
   sudo systemctl daemon-reload

   sudo systemctl restart ollama
   ```

5. Start Ollama using systemd:
   ```
   sudo systemctl start ollama
   ```

### Qdrant Setup

1. Please make sure you have installed [Docker](https://docs.docker.com/desktop/install/linux-install/) on your machine.
2. Use Qdrant docker image build Qdrant:
   ```
   docker pull qdrant/qdrant
   ```
   then run the service
   ```
   docker run -d -p 6333:6333 -p 6334:6334 \
   -v $(pwd)/qdrant_storage:/qdrant/storage:z \
   qdrant/qdrant
   ```

### Gemini API key

- Please visit [Gemini Api](https://aistudio.google.com/app/apikey) to generate your API key.

### AICH Installation

1. Please Make sure your node version is not `20.5.1`, which will causing Google API error.
2. Clone the repository
   ```
   git clone https://github.com/CAFECA-IO/AICH.git
   ```
3. Install the dependencies
   ```
   npm install
   ```
4. Create a `.env` file in the root directory and add the following environment variables (BASE_STORAGE_PATH is the path where the invoice image will be stored):

   ```
   # Google Gemini
   GOOGLE_GEMINI_API_KEY=Your_API_key

   # Ollama
   OLLAMA_HOST=http://127.0.0.1:11434

   #QDRANT_HOST
   QDRANT_HOST=http://127.0.0.1:6333

   # File storage path
   BASE_STORAGE_PATH = ${HOME}/AICH
   ```

5. Start the server
   - If you want to run the server in development mode, use the following command:
   ```
   npm run start
   ```
   - If you want to run the server in production mode, use the following command:
   ```
   npm run build
   npm run prod
   ```

### Environment

- Node.js: `^v20.16.0`
- Ollama: `^v0.3.4`
- Qdrant: `^v1.11.0`

## License

AICH is [MIT licensed](LICENSE).
