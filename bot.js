require('dotenv').config();
const http = require('http');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { processStoryImage } = require('./imageProcessor');

// Armazena a última imagem processada em memória para entrega direta à Meta
let latestProcessedBuffer = null;

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/media/story.jpg' && latestProcessedBuffer) {
    res.writeHead(200, {
      'Content-Type': 'image/jpeg',
      'Content-Length': latestProcessedBuffer.length,
      'Cache-Control': 'no-cache'
    });
    return res.end(latestProcessedBuffer);
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Samba Raiou Bot online!\n');
}).listen(PORT, () => {
  console.log(`Servidor HTTP ativo na porta ${PORT}`);
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID);
const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; // Variável nativa do Render

let pendingAction = null;

async function publishToInstagram(imageUrl, type = 'STORIES', caption = '') {
  const containerUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`;

  const params = {
    image_url: imageUrl,
    access_token: IG_ACCESS_TOKEN
  };

  if (type === 'STORIES') {
    params.media_type = 'STORIES';
  } else {
    if (caption) params.caption = caption;
  }

  const containerRes = await axios.post(containerUrl, null, { params });
  const creationId = containerRes.data.id;

  const publishUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`;
  const publishRes = await axios.post(publishUrl, null, {
    params: {
      creation_id: creationId,
      access_token: IG_ACCESS_TOKEN
    }
  });

  return publishRes.data.id;
}

bot.on('photo', async (ctx) => {
  if (String(ctx.from.id) !== ADMIN_CHAT_ID) {
    return ctx.reply('⛔ Não autorizado.');
  }

  try {
    await ctx.reply('🎨 Processando imagem com fidelidade máxima...');

    const photoArray = ctx.message.photo;
    const highResPhoto = photoArray[photoArray.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(highResPhoto.file_id);

    // Baixa o original enviado
    const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
    const rawBuffer = Buffer.from(response.data);

    // Processa com Sharp (Safe zone calibrada e sem distorção)
    latestProcessedBuffer = await processStoryImage(rawBuffer);

    // Envia prévia no Telegram (apenas visualização humana)
    await ctx.replyWithPhoto(
      { source: latestProcessedBuffer },
      {
        caption: `🥁 *Prévia Calibrada*\n\nLogo alinhada à Safe Zone e nitidez preservada.\nDeseja publicar?`,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('📲 Publicar no STORY', 'publish_story'),
            Markup.button.callback('📰 Publicar no FEED', 'publish_feed')
          ],
          [Markup.button.callback('❌ Descartar', 'cancel_post')]
        ])
      }
    );

    // Determina a URL direta de alta resolução para a Meta baixar
    const publicUrl = RENDER_EXTERNAL_URL 
      ? `${RENDER_EXTERNAL_URL}/media/story.jpg`
      : (await ctx.telegram.getFileLink(highResPhoto.file_id)).href;

    pendingAction = {
      imageUrl: publicUrl,
      caption: ctx.message.caption || ''
    };

  } catch (error) {
    console.error('Erro no processamento da imagem:', error);
    ctx.reply('❌ Falha ao processar imagem.');
  }
});

bot.action('publish_story', async (ctx) => {
  if (!pendingAction) return ctx.reply('⚠️ Nenhuma publicação pendente.');

  await ctx.editMessageCaption('⏳ Publicando Story em alta resolução no Instagram...');

  try {
    const postId = await publishToInstagram(pendingAction.imageUrl, 'STORIES');
    await ctx.reply(`✅ *Story publicado!*\nID da mídia: \`${postId}\``, { parse_mode: 'Markdown' });
    pendingAction = null;
    latestProcessedBuffer = null;
  } catch (error) {
    console.error(error.response?.data || error.message);
    const detail = error.response?.data?.error?.message || error.message;
    await ctx.reply(`❌ Erro da Meta: ${detail}`);
  }
});

bot.action('publish_feed', async (ctx) => {
  if (!pendingAction) return ctx.reply('⚠️ Nenhuma publicação pendente.');

  await ctx.editMessageCaption('⏳ Publicando no Feed...');

  try {
    const postId = await publishToInstagram(pendingAction.imageUrl, 'FEED', pendingAction.caption);
    await ctx.reply(`✅ *Post publicado no Feed!*\nID da mídia: \`${postId}\``, { parse_mode: 'Markdown' });
    pendingAction = null;
    latestProcessedBuffer = null;
  } catch (error) {
    console.error(error.response?.data || error.message);
    const detail = error.response?.data?.error?.message || error.message;
    await ctx.reply(`❌ Erro da Meta: ${detail}`);
  }
});

bot.action('cancel_post', async (ctx) => {
  pendingAction = null;
  latestProcessedBuffer = null;
  await ctx.editMessageCaption('🚫 Publicação descartada.');
});

bot.launch().then(() => {
  console.log('🚀 Bot operacional com pipeline de alta fidelidade!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
