# MemoMosaic Backend

A Node.js Express server that generates cinematic narratives and multimedia content from images and videos. Uses Google's Gemini API to intelligently create album or vlog scripts with automatic scene generation, narration, and TTS (Text-to-Speech) integration.

## Features

- 📸 **Asset Processing**: Upload images and videos for analysis
- 🎬 **Intelligent Narrative Generation**: Uses Gemini AI to create contextual stories
- 🖼️ **Collage Creation**: Automatically groups and creates collages from media by location
- 🎙️ **Voice Synthesis**: Generates audio narration with PlayHT voice cloning (fallback to Google TTS)
- 🎨 **Digital Annotations**: Render facial annotations to HTML/PNG for genealogy context
- 🌍 **Location Banners**: Fetches relevant background images from Unsplash for each location
- 📤 **Temporary File Storage**: Uploads generated content to tmpfiles.org

## Prerequisites

- Node.js (v16+)
- Multer for file uploads
- Dependencies (see package.json)

## Installation

```bash
npm install
```

## Environment Variables

Create a `.env` file in the root directory:

```env
PORT=3000
GEMINI_API_KEY=<your-google-gemini-api-key>
GEMINI_MODEL=gemini-1.5-pro
UNSPLASH_API_ACCESS_KEY=<your-unsplash-api-key>
```

## Running the Server

```bash
npm start
# or
node index.js
```

The server will start on `http://localhost:3000`

## API Endpoints

### `GET /`
Health check endpoint.

**Response:**
```json
{
  "message": "Welcome to the MemoMosaic Backend!"
}
```

### `POST /create`
Generate a complete multimedia script from uploaded media files and annotation face images.

**Request:**
- **Method**: `POST`
- **Content-Type**: `multipart/form-data`
- **Files**: 
  - `assets` (max 30 files): Media files (images/videos)
  - `annotationFaces` (max 50 files): Face images for annotations
- **Fields**:
  - `payload`: JSON string containing metadata

**Form Fields:**

Media file metadata (optional, use if structured metadata needed):
```
- assets[0].type : "IMAGE" or "VIDEO"
- assets[0].location : Location string (e.g., "Paris")
- assets[0].creation_time : ISO timestamp or date string
```

Annotation face mapping (in payload):
```json
{
  "annotations": [
    {
      "name": "John",
      "relation": "Father",
      "faceIndex": 0
    },
    {
      "name": "Jane",
      "relation": "Mother",
      "faceIndex": 1
    }
  ]
}
```

**Payload Schema:**
```json
{
  "type": "album" or "vlog",
  "memorableMoments": "Optional string describing key moments",
  "playHTCred": {
    "userId": "PlayHT user ID",
    "secretKey": "PlayHT API secret key",
    "audio": "Base64-encoded sample audio for voice cloning",
    "gender": "male" or "female"
  },
  "annotations": [
    {
      "name": "Person name",
      "relation": "Relationship",
      "faceIndex": 0
    }
  ]
}
```

**How it works:**
1. Upload media files via `assets` field
2. Upload face images via `annotationFaces` field (images are indexed 0, 1, 2, ...)
3. In the `payload.annotations` array, reference face images using `faceIndex`
4. The server converts `faceIndex` to actual base64 face data before processing
5. Face images are cleaned up after processing

**Response:**
```json
{
  "title": "Generated album/vlog title",
  "caption": "Short description",
  "hashtags": ["tag1", "tag2"],
  "scenes": [
    {
      "scene": "1",
      "narrative": "Scene narrative",
      "collage": "https://tmpfiles.org/...",
      "type": "IMAGE",
      "mimeType": "image/png",
      "location": "Paris",
      "background_image": "https://unsplash.com/...",
      "audio": "https://tmpfiles.org/..."
    }
  ]
}
```

## File Handling

1. **Upload**: Files are saved to `/tmp/uploads` on disk
2. **Processing**: Files are read and converted to base64 for API processing
3. **Asset Tracking**: Each asset is assigned an index which is preserved through all transformations (collage creation, grouping, etc.)
4. **Video URI Mapping**: Video file URIs are mapped by asset index for reliable lookups regardless of media transformations
5. **Generation**: Collages and audio are generated and uploaded to tmpfiles.org
6. **Cleanup**: Temporary files are automatically deleted after processing

## Internal Processing

### Asset Index Tracking

The system tracks assets by their original index throughout the entire processing pipeline:

1. **Initial indexing**: Assets receive an `assetIndex` property preserving their upload order
2. **Grouping**: Assets are grouped by location and type, but retain their original index
3. **Video URI mapping**: Video Gemini URIs are stored in a map keyed by asset index (`videoUriMap[assetIndex]`)
4. **Collage generation**: When videos are included in collages, their URIs are retrieved using the preserved asset index
5. **Scene generation**: Each scene correctly references the appropriate video URI through the index

This index-based approach ensures:
- ✅ Efficient lookups without string-based key matching
- ✅ Robust URI resolution through grouping and sorting transformations
- ✅ No data loss during collage creation or media grouping

## Key Dependencies

- **@google/generative-ai**: Gemini API for AI-powered narratives
- **multer**: File upload middleware
- **express**: Web framework
- **puppeteer**: HTML to image rendering for annotations
- **playht**: Voice cloning and text-to-speech
- **@wylie39/image-collage**: Collage generation from images
- **unsplash-js**: Fetching location banner images
- **ejs**: Template rendering for annotations

## Error Handling

The server includes comprehensive error handling:
- Failed file uploads are cleaned up automatically
- Collage upload failures fall back to base64 responses
- TTS generation falls back from PlayHT to Google TTS if needed
- All errors are logged to console with descriptive messages

## Usage Example

See the API endpoints section for detailed payload examples.