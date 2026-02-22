const fs = require('fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

async function run() {
    try {
        const inputPath = '/Users/pawelkomorkiewicz/.gemini/antigravity/brain/8b22dc75-d90f-4f56-8eb1-72a6ad0de123/app-icon.png';
        const outputPath = '/Users/pawelkomorkiewicz/.gemini/antigravity/brain/8b22dc75-d90f-4f56-8eb1-72a6ad0de123/app-icon-macos.png';

        console.log("Loading original image...");
        const img = await loadImage(inputPath);

        // Always work in 1024x1024 canvas space for icons
        const size = 1024;
        const canvas = createCanvas(size, size);
        const ctx = canvas.getContext('2d');

        // Official macOS Big Sur+ Icon Grid Standards:
        // The actual visible squircle should be ~82% of the total canvas size
        // to leave enough room for the system drop shadow without clipping.
        const scale = 0.82;
        const visualSize = size * scale;
        const padding = (size - visualSize) / 2;

        // Squircle radius is 22.5% of the VISUAL dimension, not the canvas
        const r = visualSize * 0.225;

        function drawSquirclePath(context) {
            context.beginPath();
            context.moveTo(padding + r, padding);
            context.lineTo(padding + visualSize - r, padding);
            context.quadraticCurveTo(padding + visualSize, padding, padding + visualSize, padding + r);
            context.lineTo(padding + visualSize, padding + visualSize - r);
            context.quadraticCurveTo(padding + visualSize, padding + visualSize, padding + visualSize - r, padding + visualSize);
            context.lineTo(padding + r, padding + visualSize);
            context.quadraticCurveTo(padding, padding + visualSize, padding, padding + visualSize - r);
            context.lineTo(padding, padding + r);
            context.quadraticCurveTo(padding, padding, padding + r, padding);
            context.closePath();
        }

        // 1. Draw the beautiful Apple native drop shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'; // Soft but deep black
        ctx.shadowBlur = 28;
        ctx.shadowOffsetY = 12;
        drawSquirclePath(ctx);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.restore();

        // 2. Add an ambient shadow for ultra realism
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 4;
        drawSquirclePath(ctx);
        ctx.fillStyle = '#FFFFFF';
        ctx.fill();
        ctx.restore();

        // 3. Clip perfectly to the squircle
        ctx.save();
        drawSquirclePath(ctx);
        ctx.clip();

        // 4. Draw the original 1024x1024 image scalled down into our new 840x840 padded bounding box
        ctx.drawImage(img, padding, padding, visualSize, visualSize);

        // 5. Add a very subtle inner specular highlight borderline representing the "glass" edge of Apple icons
        ctx.restore(); // Drop the clip so we can draw *on* the stroke inside
        ctx.save();
        drawSquirclePath(ctx);
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.stroke();

        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(outputPath, buffer);
        console.log("Successfully resized and masked icon for macOS standards!");
    } catch (error) {
        console.error("Error masking image:", error);
        process.exit(1);
    }
}

run();
