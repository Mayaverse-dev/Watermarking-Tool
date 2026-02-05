const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const {
    ServicePrincipalCredentials,
    PDFServices,
    MimeType,
    PDFWatermarkJob,
    PDFWatermarkResult,
    PDFWatermarkParams,
    WatermarkAppearance
} = require("@adobe/pdfservices-node-sdk");
require('dotenv').config();

/**
 * Creates a watermark PDF with the given text and options
 * @param {Buffer} sourcePdfBuffer - The source PDF to get dimensions from
 * @param {string} watermarkText - The text to use as watermark
 * @param {Object} options - Watermark options
 * @param {number} options.fontSize - Font size (default: 30)
 * @param {number} options.angle - Rotation angle in degrees (default: 55)
 * @param {number} options.opacity - Opacity 0-1 (default: 0.5)
 * @param {number} options.posX - X position as percentage 0-100 (default: 50)
 * @param {number} options.posY - Y position as percentage 0-100 (default: 50)
 * @returns {Promise<Buffer>} - The watermark PDF as a buffer
 */
async function createWatermarkPdf(sourcePdfBuffer, watermarkText, options = {}) {
    const {
        fontSize = 30,
        angle = 55,
        opacity = 0.5,
        posX = 50,
        posY = 50
    } = options;

    const pdfDoc = await PDFDocument.create();
    const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    const sourcePdf = await PDFDocument.load(sourcePdfBuffer);
    const pages = sourcePdf.getPages();
    
    // Use the 3rd page if available, otherwise first page
    const refPageIndex = Math.min(2, pages.length - 1);
    const { width, height } = pages[refPageIndex].getSize();

    // Create watermark page with same dimensions as source
    const page = pdfDoc.addPage([width, height]);

    // Calculate position from percentages
    // posX: 0 = left edge, 100 = right edge
    // posY: 0 = bottom edge, 100 = top edge (PDF coordinate system)
    const x = (posX / 100) * width;
    const y = (posY / 100) * height;

    page.drawText(watermarkText.toUpperCase(), {
        x,
        y,
        size: fontSize,
        font: timesRomanFont,
        color: rgb(0.5, 0.5, 0.5),
        opacity: opacity,
        rotate: degrees(angle),
    });

    return await pdfDoc.save();
}

/**
 * Applies watermark to a PDF using Adobe PDF Services
 * @param {Buffer} inputPdfBuffer - The input PDF buffer
 * @param {string} watermarkText - The watermark text
 * @param {string} outputPath - Path to save the watermarked PDF
 * @param {Object} options - Watermark options
 * @returns {Promise<string>} - Path to the output file
 */
async function applyWatermark(inputPdfBuffer, watermarkText, outputPath, options = {}) {
    let sourceFileReadStream;
    let watermarkFileReadStream;
    
    // Create temp files for streams
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    
    const tempInputPath = path.join(tempDir, `input_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    const tempWatermarkPath = path.join(tempDir, `watermark_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
    
    try {
        // Create watermark PDF with options
        console.log(`⏳ Creating watermark PDF for "${watermarkText}"...`);
        const watermarkPdfBytes = await createWatermarkPdf(inputPdfBuffer, watermarkText, options);
        
        // Write temp files
        fs.writeFileSync(tempInputPath, inputPdfBuffer);
        fs.writeFileSync(tempWatermarkPath, watermarkPdfBytes);
        
        // Initialize Adobe PDF Services
        console.log('⏳ Initializing Adobe PDF Services...');
        const credentials = new ServicePrincipalCredentials({
            clientId: process.env.PDF_SERVICES_CLIENT_ID,
            clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET
        });

        const pdfServices = new PDFServices({ credentials });

        sourceFileReadStream = fs.createReadStream(tempInputPath);
        watermarkFileReadStream = fs.createReadStream(tempWatermarkPath);

        console.log('⏳ Uploading assets...');
        const [inputAsset, watermarkAsset] = await pdfServices.uploadAssets({
            streamAssets: [{
                readStream: sourceFileReadStream,
                mimeType: MimeType.PDF
            }, {
                readStream: watermarkFileReadStream,
                mimeType: MimeType.PDF
            }]
        });

        const watermarkAppearance = new WatermarkAppearance({
            appearOnForeground: false,
            opacity: 40,
        });

        const pdfWatermarkParams = new PDFWatermarkParams({
            watermarkAppearance: watermarkAppearance
        });

        const job = new PDFWatermarkJob({
            inputAsset: inputAsset,
            watermarkAsset: watermarkAsset,
            params: pdfWatermarkParams
        });

        console.log('⏳ Submitting watermark job...');
        const pollingURL = await pdfServices.submit({ job });

        const pdfServicesResponse = await pdfServices.getJobResult({
            pollingURL,
            resultType: PDFWatermarkResult
        });

        const resultAsset = pdfServicesResponse.result.asset;
        const streamAsset = await pdfServices.getContent({ asset: resultAsset });

        console.log(`⏳ Saving result to ${outputPath}...`);

        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(outputPath);
            streamAsset.readStream.pipe(writeStream);

            writeStream.on('finish', () => {
                console.log(`✅ PDF watermarked with "${watermarkText}" saved.`);
                resolve();
            });

            writeStream.on('error', (err) => {
                console.error("❌ Error writing PDF:", err);
                reject(err);
            });
        });

        return outputPath;
    } finally {
        sourceFileReadStream?.destroy();
        watermarkFileReadStream?.destroy();
        
        // Cleanup temp files
        try {
            if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath);
            if (fs.existsSync(tempWatermarkPath)) fs.unlinkSync(tempWatermarkPath);
        } catch (e) {
            console.warn('Warning: Could not clean up temp files:', e.message);
        }
    }
}

/**
 * Process multiple watermarks for a single PDF
 * @param {Buffer} inputPdfBuffer - The input PDF buffer
 * @param {string[]} watermarkTexts - Array of watermark texts
 * @param {string} outputDir - Directory to save output files
 * @param {Object} options - Watermark options
 * @returns {Promise<string[]>} - Array of output file paths
 */
async function processMultipleWatermarks(inputPdfBuffer, watermarkTexts, outputDir, options = {}) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPaths = [];
    
    // Process sequentially to avoid rate limiting from Adobe API
    for (let i = 0; i < watermarkTexts.length; i++) {
        const text = watermarkTexts[i].trim();
        if (!text) continue;
        
        const sanitizedName = text.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        const outputPath = path.join(outputDir, `${sanitizedName}.pdf`);
        
        await applyWatermark(inputPdfBuffer, text, outputPath, options);
        outputPaths.push(outputPath);
    }

    return outputPaths;
}

module.exports = {
    createWatermarkPdf,
    applyWatermark,
    processMultipleWatermarks
};
