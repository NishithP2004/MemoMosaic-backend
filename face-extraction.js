const faceapi = require("@vladmandic/face-api")
const canvas = require("canvas")
const { Canvas, Image, ImageData } = canvas;
faceapi.env.monkeyPatch({ Canvas, Image, ImageData })
// const fs = require("fs")

const loadFaceApiModels = () => {
    Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromDisk(__dirname + "/weights"),
        faceapi.nets.faceLandmark68Net.loadFromDisk(__dirname + "/weights"),
        faceapi.nets.faceRecognitionNet.loadFromDisk(__dirname + "/weights"),
        faceapi.nets.ssdMobilenetv1.loadFromDisk(__dirname + "/weights")
    ]).then(() => {
        console.log("Face-api.js models loaded.");
    }).catch((err) => {
        console.error("Error loading models:", err);
    });
}

async function runDetection(base64Data, rt = "detection") {
    try {
        const buffer = Buffer.from(base64Data, 'base64');

        const img = await canvas.loadImage(buffer);

        const newCanvas = canvas.createCanvas(img.width, img.height);
        const ctx = newCanvas.getContext('2d');
        ctx.drawImage(img, 0, 0, newCanvas.width, newCanvas.height);

        const detections = await faceapi.detectAllFaces(newCanvas, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptors();
        
        if (rt === "detection") {
            return detections;
        } else if (rt === "extraction") {
            if (detections.length > 0) {
                console.log("Face detected!");

                const facePaths = [];
                for (const [index, face] of detections.entries()) {
                    const box = face.detection.box;
                    ctx.strokeStyle = 'red';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.rect(box.x, box.y, box.width, box.height);
                    ctx.stroke();

                    // Extract the face
                    const faceCanvas = canvas.createCanvas(box.width, box.height);
                    const faceCtx = faceCanvas.getContext('2d');
                    faceCtx.drawImage(newCanvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
                    // const faceFileName = `face_${Date.now()}_${index}.jpg`;
                    // fs.writeFileSync(faceFileName, faceCanvas.toBuffer('image/jpeg', { quality: 0.8 }));
                    facePaths.push(faceCanvas.toBuffer('image/jpeg', { quality: 0.8 }).toString("base64"));
                    // console.log(`Detected face saved to: ${faceFileName}`);
                }

                return facePaths;
            } else {
                console.log("No face detected.");
                return [];
            }
        }
    } catch (error) {
        console.error("Error processing frame:", error);
        return [];
    }
}

module.exports = {
    loadFaceApiModels,
    runDetection
}