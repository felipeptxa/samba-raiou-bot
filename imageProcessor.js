const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, 'assets', 'logo-branco.png');

async function processStoryImage(inputBuffer) {
  const TARGET_W = 1080;
  const TARGET_H = 1920;

  const metadata = await sharp(inputBuffer).metadata();
  const inputRatio = metadata.width / metadata.height;
  const targetRatio = TARGET_W / TARGET_H; // ~0.5625

  let baseImage;

  // Se a imagem já for quase 9:16 (entre 0.50 e 0.62), usa em tela cheia sem barras
  if (inputRatio >= 0.50 && inputRatio <= 0.62) {
    baseImage = sharp(inputBuffer)
      .resize(TARGET_W, TARGET_H, {
        fit: 'cover',
        kernel: sharp.kernel.lanczos3
      });
  } else {
    // Para fotos horizontais ou quadradas: fundo borrado elegante
    const background = await sharp(inputBuffer)
      .resize(TARGET_W, TARGET_H, { fit: 'cover', kernel: sharp.kernel.lanczos3 })
      .blur(30)
      .modulate({ brightness: 0.60 })
      .toBuffer();

    const foreground = await sharp(inputBuffer)
      .resize(TARGET_W, TARGET_H, { fit: 'inside', kernel: sharp.kernel.lanczos3 })
      .toBuffer();

    baseImage = sharp(background).composite([
      { input: foreground, gravity: 'center' }
    ]);
  }

  // Renderiza a base tratada com leve compensação de nitidez
  let canvasBuffer = await baseImage
    .sharpen({ sigma: 1.0, m1: 1.0, m2: 2.0 })
    .toBuffer();

  // Aplicação da Logo na Safe Zone oficial dos Stories
  if (fs.existsSync(LOGO_PATH)) {
    const LOGO_WIDTH = 340;
    const logoBuffer = await sharp(LOGO_PATH)
      .resize({ width: LOGO_WIDTH, kernel: sharp.kernel.lanczos3 })
      .toBuffer();

    const logoMeta = await sharp(logoBuffer).metadata();
    
    // Posicionamento: centralizado na horizontal, 190px acima do rodapé final
    const leftPos = Math.round((TARGET_W - LOGO_WIDTH) / 2);
    const topPos = TARGET_H - logoMeta.height - 190;

    canvasBuffer = await sharp(canvasBuffer)
      .composite([
        {
          input: logoBuffer,
          top: topPos,
          left: leftPos
        }
      ])
      .toBuffer();
  }

  // Exportação em JPEG com chroma subsampling desativado (4:4:4) para preservar textos
  return await sharp(canvasBuffer)
    .jpeg({
      quality: 96,
      chromaSubsampling: '4:4:4'
    })
    .toBuffer();
}

module.exports = { processStoryImage };
