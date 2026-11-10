require('dotenv').config();
const http = require('http');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const { processStoryImage } = require('./imageProcessor');

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Samba Raiou Bot online!\n');
}).listen(PORT, () => {
  console.log(`Servidor HTTP ouvindo na porta ${PORT}`);
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID);
const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

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
    await ctx.reply('🎨 Aplicando identidade visual Samba Raiou...');

    const photoArray = ctx.message.photo;
    const highResPhoto = photoArray[photoArray.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(highResPhoto.file_id);

    // 1. Download do buffer da imagem
    const response = await axios.get(fileUrl.href, { responseType: 'arraybuffer' });
    const rawBuffer = Buffer.from(response.data);

    // 2. Processamento automático de branding e proporção 9:16
    const brandedBuffer = await processStoryImage(rawBuffer);

    // 3. Devolve a prévia tratada para aprovação do usuário
    const previewMessage = await ctx.replyWithPhoto(
      { source: brandedBuffer },
      {
        caption: `🥁 *Prévia com Identidade Visual Aplicada*\n\nProporção 9:16 ajustada e marca d'água inserida.\nDeseja publicar no *@sambaraiou*?`,
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

    // Captura o link gerado pelo Telegram para a imagem com branding
    const processedPhotoArray = previewMessage.photo;
    const processedHighRes = processedPhotoArray[processedPhotoArray.length - 1];
    const processedFileLink = await ctx.telegram.getFileLink(processedHighRes.file_id);

    pendingAction = {
      imageUrl: processedFileLink.href,
      caption: ctx.message.caption || ''
    };

  } catch (error) {
    console.error('Erro no processamento da imagem:', error);
    ctx.reply('❌ Falha ao aplicar identidade visual na imagem.');
  }
});

bot.action('publish_story', async (ctx) => {
  if (!pendingAction) return ctx.reply('⚠️ Nenhuma publicação pendente.');

  await ctx.editMessageCaption('⏳ Enviando Story com branding para o Instagram...');

  try {
    const postId = await publishToInstagram(pendingAction.imageUrl, 'STORIES');
    await ctx.reply(`✅ *Story publicado!*\nID da mídia: \`${postId}\``, { parse_mode: 'Markdown' });
    pendingAction = null;
  } catch (error) {
    console.error(error.response?.data || error.message);
    const detail = error.response?.data?.error?.message || error.message;
    await ctx.reply(`❌ Erro da Meta: ${detail}`);
  }
});

bot.action('publish_feed', async (ctx) => {
  if (!pendingAction) return ctx.reply('⚠️ Nenhuma publicação pendente.');

  await ctx.editMessageCaption('⏳ Publicando no Feed do @sambaraiou...');

  try {
    const postId = await publishToInstagram(pendingAction.imageUrl, 'FEED', pendingAction.caption);
    await ctx.reply(`✅ *Post publicado no Feed!*\nID da mídia: \`${postId}\``, { parse_mode: 'Markdown' });
    pendingAction = null;
  } catch (error) {
    console.error(error.response?.data || error.message);
    const detail = error.response?.data?.error?.message || error.message;
    await ctx.reply(`❌ Erro da Meta: ${detail}`);
  }
});

bot.action('cancel_post', async (ctx) => {
  pendingAction = null;
  await ctx.editMessageCaption('🚫 Publicação descartada.');
});

bot.launch().then(() => {
  console.log('🚀 Samba Raiou Bot pronto com Sharp e Branding!');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
