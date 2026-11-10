require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const IG_USER_ID = process.env.IG_USER_ID;
const IG_ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;

let pendingPost = null;

async function publishToInstagram(imageUrl, caption) {
  const containerUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`;
  const containerRes = await axios.post(containerUrl, null, {
    params: {
      image_url: imageUrl,
      caption: caption,
      access_token: IG_ACCESS_TOKEN
    }
  });

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

bot.start((ctx) => {
  ctx.reply('🥁 Samba Raiou Bot ativo! Use /testepost para enviar uma publicação de teste para aprovação.');
});

bot.command('testepost', async (ctx) => {
  const testImage = 'https://picsum.photos/1080/1080';
  const testCaption = '🥁 Teste de automação de publicação do Samba Raiou!';
  await sendPostForApproval(testImage, testCaption);
});

bot.action('approve_post', async (ctx) => {
  if (!pendingPost) {
    return ctx.reply('⚠️ Nenhum post pendente de aprovação.');
  }

  await ctx.editMessageCaption('⏳ Publicando no Instagram do @sambaraiou...');

  try {
    const postId = await publishToInstagram(pendingPost.imageUrl, pendingPost.caption);
    await ctx.reply(`✅ Post publicado com sucesso no feed!\nID da publicação: ${postId}`);
    pendingPost = null;
  } catch (error) {
    console.error(error.response?.data || error.message);
    const detail = error.response?.data?.error?.message || error.message;
    await ctx.reply(`❌ Erro ao publicar: ${detail}`);
  }
});

bot.action('reject_post', async (ctx) => {
  pendingPost = null;
  await ctx.editMessageCaption('🚫 Publicação descartada.');
  await ctx.reply('Post rejeitado. Nenhuma alteração foi feita no Instagram.');
});

async function sendPostForApproval(imageUrl, caption) {
  pendingPost = { imageUrl, caption };

  await bot.telegram.sendPhoto(ADMIN_CHAT_ID, imageUrl, {
    caption: `📢 *Prévia de Postagem Samba Raiou*\n\n${caption}`,
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      Markup.button.callback('✅ Aprovar e Publicar', 'approve_post'),
      Markup.button.callback('❌ Rejeitar', 'reject_post')
    ])
  });
}

bot.launch().then(() => {
  console.log('🚀 Samba Raiou Bot iniciado com sucesso! Escutando Telegram...');
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
