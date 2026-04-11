const profileModel = require('../../models/profileSchema');
module.exports = {
  name: 'deletedatabase',
  description: 'Delete a user from the database (owner only)',
  async execute(message, args) {
    if (message.author.id !== '460509056487129090')
      return message.channel.send('Only the owner can use this command!');
    if (!args[0]) return message.channel.send('Please provide a user to remove from my database.');
    const user = message.mentions.users.first();
    if (!user) return message.channel.send('Please mention a valid user.');
    const msg = await message.channel.send(`Deleting ${user} from my database...`);
    const existing = await profileModel.findOne({ userID: user.id });
    if (!existing) return msg.edit(`That person is not in my database.`);
    await profileModel.findOneAndDelete({ userID: user.id });
    setTimeout(() => msg.edit(`Success! ${user} was removed from the database.`), 1000);
  }
};
