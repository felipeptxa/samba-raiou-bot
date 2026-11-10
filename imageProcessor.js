const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.join(__dirname, 'assets', 'logo-branco.png');

async function processStoryImage(inputBuffer) {
  const TARGET_WIDTH = 1080;
  const TARGET_HEIGHT = 1920;

  // 1. Obter metadados da imagem enviada
  const metadata = await sharp(inputBuffer).metadata();
  const { width, height } = metadata;

  // 2. Gerar fundo desfocado (smart blur) para preencher barras pretas se não for 9:16
  const background = await sharp(inputBuffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'cover' })
    .blur(25)
    .modulate({ brightness: 0.65 }) // Leve escurecimento para contraste
    .toBuffer();

  // 3. Redimensionar a foto principal para caber dentro da área útil
  const foreground = await sharp(inputBuffer)
    .resize(TARGET_WIDTH, TARGET_HEIGHT, { fit: 'inside' })
    .toBuffer();

  // 4. Preparar o logo institucional do Samba Raiou (largura máx 420px)
  let overlays = [];

  // Composição da foto sobre o fundo borrado
  overlays.push({
    input: foreground,
    gravity: 'center'
  });

  if (fs.existsSync(LOGO_PATH)) {
    const logoBuffer = await sharp(LOGO_PATH)
      .resize({ width: 380 })
      .toBuffer();

    // Posiciona o logo centralizado próximo ao rodapé (margem de segurança dos Stories)
    overlays.push({
      input: logoBuffer,
      gravity: 'south',
      top: 1680,
      left: Math.round((TARGET_WIDTH - 380) / 2)
    });
  }

  // 5. Renderizar o composite final em 1080x1920 JPG de alta qualidade
  return await sharp(background)
    .composite(overlays)
    .jpeg({ quality: 92 })
    .toBuffer();
}

module.exports = { processStoryImage };
