const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { processMultipleWatermarks } = require('./watermarkService');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files are allowed'), false);
        }
    }
});

// Ensure output directories exist
const outputDir = path.join(__dirname, 'output');
const uploadsDir = path.join(__dirname, 'uploads');
[outputDir, uploadsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Cleanup old files (older than 1 hour)
function cleanupOldFiles() {
    const maxAge = 60 * 60 * 1000; // 1 hour
    const now = Date.now();
    
    [outputDir, uploadsDir].forEach(dir => {
        if (fs.existsSync(dir)) {
            fs.readdirSync(dir).forEach(file => {
                const filePath = path.join(dir, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > maxAge) {
                    if (stats.isDirectory()) {
                        fs.rmSync(filePath, { recursive: true, force: true });
                    } else {
                        fs.unlinkSync(filePath);
                    }
                }
            });
        }
    });
}

// Run cleanup every 30 minutes
setInterval(cleanupOldFiles, 30 * 60 * 1000);

// API endpoint for watermarking
app.post('/api/watermark', upload.single('pdf'), async (req, res) => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const sessionOutputDir = path.join(outputDir, sessionId);
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const { watermarks } = req.body;
        if (!watermarks || typeof watermarks !== 'string') {
            return res.status(400).json({ error: 'Watermarks text is required' });
        }

        // Parse comma-separated watermarks
        const watermarkTexts = watermarks
            .split(',')
            .map(w => w.trim())
            .filter(w => w.length > 0);

        if (watermarkTexts.length === 0) {
            return res.status(400).json({ error: 'At least one watermark text is required' });
        }

        // Parse watermark options
        const options = {
            fontSize: parseInt(req.body.fontSize) || 30,
            angle: parseInt(req.body.angle) || 55,
            opacity: parseFloat(req.body.opacity) || 0.5,
            posX: parseFloat(req.body.posX) || 50,
            posY: parseFloat(req.body.posY) || 50
        };

        console.log(`Processing ${watermarkTexts.length} watermark(s):`, watermarkTexts);
        console.log('Options:', options);

        // Process watermarks
        const outputPaths = await processMultipleWatermarks(
            req.file.buffer,
            watermarkTexts,
            sessionOutputDir,
            options
        );

        if (outputPaths.length === 0) {
            return res.status(500).json({ error: 'No files were generated' });
        }

        // If single file, send it directly
        if (outputPaths.length === 1) {
            const filePath = outputPaths[0];
            const fileName = path.basename(filePath);
            
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
            
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);
            
            fileStream.on('end', () => {
                // Cleanup after sending
                setTimeout(() => {
                    fs.rmSync(sessionOutputDir, { recursive: true, force: true });
                }, 5000);
            });
            return;
        }

        // Multiple files - create ZIP
        const zipFileName = `watermarked_pdfs_${Date.now()}.zip`;
        const zipPath = path.join(outputDir, zipFileName);
        
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => {
            console.log(`ZIP created: ${archive.pointer()} bytes`);
            
            res.setHeader('Content-Type', 'application/zip');
            res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
            
            const zipStream = fs.createReadStream(zipPath);
            zipStream.pipe(res);
            
            zipStream.on('end', () => {
                // Cleanup after sending
                setTimeout(() => {
                    fs.rmSync(sessionOutputDir, { recursive: true, force: true });
                    fs.unlinkSync(zipPath);
                }, 5000);
            });
        });

        archive.on('error', (err) => {
            console.error('Archive error:', err);
            res.status(500).json({ error: 'Failed to create ZIP archive' });
        });

        archive.pipe(output);

        // Add all PDFs to the archive
        for (const filePath of outputPaths) {
            archive.file(filePath, { name: path.basename(filePath) });
        }

        await archive.finalize();

    } catch (error) {
        console.error('Error processing watermark request:', error);
        
        // Cleanup on error
        if (fs.existsSync(sessionOutputDir)) {
            fs.rmSync(sessionOutputDir, { recursive: true, force: true });
        }
        
        res.status(500).json({ 
            error: 'Failed to process watermark request',
            details: error.message 
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
