const express = require("express");
require("dotenv").config();
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const {
    generateScript,
    uploadFile
} = require("./utils");
const multer = require("multer")

// Create uploads directory if it doesn't exist
const uploadsDir = '/tmp/uploads';
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, {
        recursive: true
    });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage
})

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({
    extended: true
}))
app.use(cors())
app.set('trust proxy', true);

app.get("/", (req, res) => {
    res.send({
        "message": "Welcome to the MemoMosaic Backend!"
    })
})

app.post("/create", upload.fields([
    { name: 'assets', maxCount: 30 },
    { name: 'annotationFaces', maxCount: 50 }
]), async (req, res) => {
    const uploadedFilePaths = [];
    try {
        const payload = JSON.parse(req.body.payload)
        const mediaFiles = req.files?.assets || []
        const annotationFiles = req.files?.annotationFaces || []

        // Convert uploaded media files to asset objects with base64 buffers from disk
        const assets = mediaFiles.map((file, index) => {
            uploadedFilePaths.push(file.path);
            const fileBuffer = fs.readFileSync(file.path);
            return {
                buffer: fileBuffer.toString('base64'),
                type: req.body[`assets[${index}].type`] || payload.assetMetadata?.[index]?.type || "IMAGE",
                mimeType: file.mimetype,
                location: req.body[`assets[${index}].location`] || payload.assetMetadata?.[index]?.location || "Unknown",
                creation_time: req.body[`assets[${index}].creation_time`] || payload.assetMetadata?.[index]?.creation_time || new Date().toISOString()
            };
        })

        // Convert uploaded annotation face files to base64 and map to annotations by index
        const annotationFaceBuffers = annotationFiles.map((file) => {
            uploadedFilePaths.push(file.path);
            const fileBuffer = fs.readFileSync(file.path);
            return fileBuffer.toString('base64');
        });

        // Inject base64 face data into annotations array based on faceIndex
        if (payload.annotations && Array.isArray(payload.annotations)) {
            payload.annotations = payload.annotations.map(annotation => {
                if (annotation.faceIndex !== undefined && annotationFaceBuffers[annotation.faceIndex]) {
                    return {
                        ...annotation,
                        image: annotationFaceBuffers[annotation.faceIndex],
                        faceIndex: undefined // Remove index after mapping
                    };
                }
                return annotation;
            });
        }

        // Merge assets with payload
        payload.assets = assets

        const script = await generateScript(payload);

        // Upload collages to tmpfiles.org, but preserve base64 for clients that need
        // direct bytes and cannot fetch tmpfiles.org because of browser CORS.
        script.scenes = await Promise.all(script.scenes.map(async (scene) => {
            try {
                const uploadUrl = await uploadFile(scene.collage, `collage-${Date.now()}.${scene.type === 'IMAGE' ? 'png' : 'mp4'}`);
                return {
                    ...scene,
                    collageBase64: scene.collage,
                    collageUrl: uploadUrl,
                    collage: uploadUrl // Keep existing response contract for URL-based clients
                };
            } catch (err) {
                console.error(`Error uploading collage: ${err.message}`);
                // Return scene with base64 if upload fails
                return {
                    ...scene,
                    collageBase64: scene.collage
                };
            }
        }));

        res.send(script);
    } catch (err) {
        console.error(err);
        res.status(500).send({
            success: false,
            error: err.message
        })
    } finally {
        // Clean up uploaded files from /tmp/uploads
        uploadedFilePaths.forEach(filePath => {
            try {
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            } catch (err) {
                console.error(`Error deleting file ${filePath}: ${err.message}`);
            }
        });
    }
})

app.listen(PORT, () => {
    console.log(`Listening on port: ${PORT}`)
})
