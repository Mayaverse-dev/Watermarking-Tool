const fs = require('fs');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const path = require("path");
const os = require("os");
const {
    ServicePrincipalCredentials,
    PDFServices,
    MimeType,
    PDFWatermarkJob,
    PDFWatermarkResult,
    SDKError,
    ServiceUsageError,
    ServiceApiError,
    PDFWatermarkParams,
    WatermarkAppearance
} = require("@adobe/pdfservices-node-sdk");
require('dotenv').config();


(async () => {
    let sourceFileReadStream;
    let watermarkFileReadStream;
    try {
        // --- PART 1: Create the watermark PDF ---
        console.log('⏳ Creating watermark PDF...');
        const pdfDoc = await PDFDocument.create();
        const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
        const page = pdfDoc.addPage();

        const pdfBytes1 = fs.readFileSync("Original.pdf");
        const pdfDoc2 = await PDFDocument.load(pdfBytes1);
        const pages = pdfDoc2.getPages();

        // Use the size of the 3rd page (index 2) as reference
        const { width, height } = pages[2].getSize();

        const fontSize = 30;
        const watermarkText = 'For Aakriti';
        page.drawText(watermarkText.toUpperCase(), {
            x: width / 2 - 10,
            y: height / 2 - 20,
            size: fontSize,
            font: timesRomanFont,
            color: rgb(0.5, 0.5, 0.5),
            opacity: 0.5,
            rotate: degrees(55),
        });

        const pdfBytes = await pdfDoc.save();
        fs.writeFileSync('output.pdf', pdfBytes);
        console.log('✅ PDF created as output.pdf');

        // --- PART 2: Apply watermark using Adobe Services ---
        console.log('⏳ Initializing Adobe PDF Services...');
        const credentials = new ServicePrincipalCredentials({
            clientId: process.env.PDF_SERVICES_CLIENT_ID,
            clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET
        });

        const pdfServices = new PDFServices({ credentials });

        sourceFileReadStream = fs.createReadStream("input.pdf");
        watermarkFileReadStream = fs.createReadStream("output.pdf");

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

        const outputFilePath = "./pdfWatermarkOutput.pdf";
        console.log(`⏳ Saving result to ${outputFilePath}...`);

        await new Promise((resolve, reject) => {
            const writeStream = fs.createWriteStream(outputFilePath);
            streamAsset.readStream.pipe(writeStream);

            writeStream.on('finish', () => {
                console.log("✅ PDF successfully watermarked and saved.");
                resolve();
            });

            writeStream.on('error', (err) => {
                console.error("❌ Error writing PDF:", err);
                reject(err);
            });
        });

    } catch (err) {
        console.error("❌ Exception encountered while executing operation:", err);
    } finally {
        sourceFileReadStream?.destroy();
        watermarkFileReadStream?.destroy();
    }
})();
