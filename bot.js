require('dotenv').config();
const http = require('http');
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

// Mini servidor HTTP para manter o Render Web Service ativo no plano Free
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
    const photoArray = ctx.message.photo;
    const highResPhoto = photoArray[photoArray.length - 1];
    const fileUrl = await ctx.telegram.getFileLink(highResPhoto.file_id);
    const caption = ctx.message.caption || '';

    pendingAction = {
      imageUrl: fileUrl.href,
      caption: caption
    };

    await ctx.replyWithPhoto(highResPhoto.file_id, {
      caption: `📸 *Imagem recebida!*\n\nOnde deseja publicar no *@sambaraiou*?`,
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('📲 Publicar no STORY', 'publish_story'),
          Markup.button.callback('📰 Publicar no FEED', 'publish_feed')
        ],
        [Markup.button.callback('❌ Descartar', 'cancel_post')]
      ])
    });
  } catch (error) {
    console.error('Erro ao processar imagem:', error);
    ctx.reply('❌ Falha ao processar a imagem do Telegram.');
  }
});

bot.action('publish_story', async (ctx) => {
  if (!pendingAction) return ctx.reply('⚠️ Nenhuma publicação pendente.');

  await ctx.editMessageCaption('⏳ Enviando Story para o Instagram do @sambaraiou...');

  try {
    const postId = await publishToInstagram(pendingAction.imageUrl, 'STORIES');
    await ctx.reply(`✅ *Story publicado com sucesso!*\nID da mídia: \`${postId}\``, { parse_mode: 'Markdown' });
    pendingAction = null;
  } catch (error) {
    console.error(error.response?.data || error.message);
    const detail = error.response?.data?.error?.message || error.message;
    await ctx.reply(`❌ Erro da Meta ao publicar Story: ${detail}`);
  }
});

bot.action('publish_feed', async (ctx) => {
  if (!pendingAction) return ctx.reply('⚠️ Nenhuma publicação pendente.');

  await ctx.editMessageCaption('⏳ Publicando no Feed do @sambaraiou...');

  try {
    const postId = await publishToInstagram(pendingAction.imageUrl, 'FEED', pendingAction.caption);
    await ctx.reply(`✅ *Post no Feed publicado!*\nID da mídia: \`${postId}\``, { parse_mode: 'Markdown' });
    pendingAction = null;
  } catch (error) {
    console.error(error.response?.data || error.message);
    const detail = error.response?.data?.error?.message || error.message;
    await ctx.reply(`❌ Erro da Meta ao publicar no Feed: ${detail}`);
  }
});

bot.action('cancel_post', async (ctx) => {
  pendingAction = null;
  await ctx.editMessageCaption('🚫 Publicação descartada.');
});

bot.launch().then(() => {
  console.log('🚀 Samba Raiou Bot atualizado! Envie fotos pelo celular no Telegram.');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
