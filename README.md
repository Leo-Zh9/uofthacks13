# Alias - AI-Powered Binary Analysis

Transform executables into readable C code using Ghidra and Gemini AI.

Built for **UofTHacks 13**.

![Alias Demo](https://via.placeholder.com/800x400?text=Alias+Demo)

## Features

- **Drag-and-Drop Upload**: Simply drag your `.exe` or ELF binary onto the page
- **Chrome Extension**: Automatically intercepts downloaded executables for analysis
- **Real-time Progress**: Watch the decompilation process with live console output
- **Two-Pass AI Refactoring**: Gemini 3 Pro fixes logic, Gemini Flash improves readability
- **Split View Comparison**: See the raw vs. refactored code side-by-side
- **Export**: Download the clean, refactored code as a `.c` file

## Tech Stack

- **Frontend**: Next.js 14, TailwindCSS, Monaco Editor, Framer Motion
- **Backend**: Python FastAPI
- **Decompiler**: PyGhidra (Ghidra's Python bindings)
- **AI**: Google Gemini 3 Pro + Gemini Flash (two-pass refactoring)

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- Java 17+ (for Ghidra)
- Ghidra 11.x installed

### Environment Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/uofthacks13.git
cd uofthacks13
```

2. Set up environment variables:
```bash
# Create .env file in server directory
echo "GEMINI_API_KEY=your-gemini-api-key-here" > server/.env
echo "GHIDRA_INSTALL_DIR=/path/to/ghidra" >> server/.env
```

### Running the Backend

```bash
cd server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Running the Frontend

```bash
cd client

# Install dependencies
npm install

# Run development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

## Docker Deployment

For production deployment with sandboxed binary analysis:

```bash
# Set your Gemini API key
export GEMINI_API_KEY=your-gemini-api-key-here

# Build and run with Docker Compose
docker-compose up --build
```

## Project Structure

```
uofthacks13/
├── client/                    # Next.js frontend
│   ├── app/
│   │   ├── page.tsx          # Main page
│   │   ├── layout.tsx        # Root layout
│   │   └── globals.css       # Cyberpunk theme styles
│   ├── components/
│   │   ├── FileDropzone.tsx  # Drag-drop upload
│   │   ├── ProgressStepper.tsx
│   │   ├── ConsoleStream.tsx
│   │   └── CodeViewer.tsx    # Monaco split view
│   └── lib/
│       └── api.ts            # API client
├── server/                    # FastAPI backend
│   ├── main.py               # FastAPI app
│   ├── routers/
│   │   └── decompile.py      # Upload & job endpoints
│   ├── services/
│   │   ├── ghidra_service.py # PyGhidra integration
│   │   └── ai_service.py     # GPT-4o refactoring
│   └── models/
│       └── schemas.py        # Pydantic models
└── docker-compose.yml        # Production deployment
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/upload` | POST | Upload a binary file for decompilation |
| `/api/job/{id}` | GET | Get job status and logs |
| `/api/job/{id}/result` | GET | Get decompilation results |

## Security

- Binaries are **never executed**, only analyzed
- Uploaded files are deleted after processing
- Docker containers run with minimal privileges
- Rate limiting on upload endpoint

## How It Works

1. **Upload**: User uploads a PE (.exe) or ELF binary
2. **Analyze**: PyGhidra loads and auto-analyzes the binary
3. **Decompile**: Each user-written function is decompiled to pseudo-C (library functions are filtered out)
4. **Refactor (Two-Pass)**:
   - **Pass 1 (Gemini 3 Pro)**: Fixes control flow, reconstructs data structures, corrects logic
   - **Pass 2 (Gemini Flash)**: Renames variables, improves readability, adds comments
5. **Display**: Split view shows before/after comparison

## Demo Tips

For the best hackathon demo:
1. Use a small, simple binary (< 1MB)
2. Pre-upload a sample binary to show the full flow
3. Have the split view ready to show the transformation

## Authors

Built at UofTHacks 13
