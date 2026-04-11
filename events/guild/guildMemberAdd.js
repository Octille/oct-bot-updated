const profileModel = require('../../models/profileSchema');
const Canvas = require('canvas');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const Guild = require('../../models/guild');
const mongoose = require('mongoose');

module.exports = async (client, member) => {
  try {
    const profileData = await profileModel.findOne({ userID: member.id });
    if (!profileData) {
      await profileModel.create({
        userID: member.id,
        serverID: member.guild.id,
        coins: 1000,
        bank: 0,
        Company: { miners: 0, workers: 0 },
        Items: { Shirt: 1, Pants: 1 },
      });
    }
  } catch (err) {
    console.log(err);
  }

  const settings = await Guild.findOne({ guildID: member.guild.id });
  if (!settings || !settings.welcomeID || settings.welcomeID === '0') return;

  try {
    const canvas = Canvas.createCanvas(700, 250);
    const ctx = canvas.getContext('2d');

    const background = await Canvas.loadImage(path.join(__dirname, '../../wallpaper.jpg'));
    ctx.drawImage(background, 0, 0);

    const pfp = await Canvas.loadImage(member.user.displayAvatarURL({ extension: 'png', size: 128 }));
    const pfpX = canvas.width / 2 - pfp.width / 2;
    ctx.drawImage(pfp, pfpX, 25);

    ctx.fillStyle = '#ffffff';
    ctx.font = '35px sans-serif';
    let text = `Welcome ${member.user.username}`;
    let x = canvas.width / 2 - ctx.measureText(text).width / 2;
    ctx.fillText(text, x, 60 + pfp.height);

    ctx.font = '30px sans-serif';
    text = `Member #${member.guild.memberCount}`;
    x = canvas.width / 2 - ctx.measureText(text).width / 2;
    ctx.fillText(text, x, 100 + pfp.height);

    const attachment = new AttachmentBuilder(canvas.toBuffer(), { name: 'welcome.png' });
    const channel = member.guild.channels.cache.get(`${settings.welcomeID}`);
    if (channel) await channel.send({ files: [attachment] });
  } catch (err) {
    console.log('Welcome image error:', err);
  }
};
