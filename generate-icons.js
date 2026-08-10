import fs from 'fs';
import sharp from 'sharp';

async function generateIcons() {
  console.log('Generating icons from icon.svg...');
  
  const svgBuffer = fs.readFileSync('./icon.svg');

  // Generate 192x192 PNG
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile('./icon-192.png');
    
  // Also copy to apple-touch-icon
  fs.copyFileSync('./icon-192.png', './apple-touch-icon.png');

  // Generate 512x512 PNG
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile('./icon-512.png');

  // For favicon.ico, we can just use the 192x192 png content renamed or let it be a png.
  // Actually, sharp can't output .ico natively, but browsers accept PNG disguised as .ico or we can just keep the .png
  // and we'll just copy it for fallback
  fs.copyFileSync('./icon-192.png', './favicon.ico');

  console.log('Icons generated successfully!');
}

generateIcons().catch(console.error);
