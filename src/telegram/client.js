const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram');
const input = require('input');
const fs = require('fs').promises;
const path = require('path');

class TelegramService {
  constructor() {
    this.client = null;
    this.apiId = parseInt(process.env.API_ID);
    this.apiHash = process.env.API_HASH;
    this.phoneNumber = process.env.PHONE_NUMBER;
    this.sessionString = process.env.SESSION_STRING || '';
    this.isConnected = false;
  }

  async initialize() {
    try {
      const stringSession = new StringSession(this.sessionString);
      
      this.client = new TelegramClient(stringSession, this.apiId, this.apiHash, {
        connectionRetries: 5,
      });

      await this.client.start({
        phoneNumber: async () => this.phoneNumber,
        password: async () => await input.text('Please enter your password: '),
        phoneCode: async () => await input.text('Please enter the code you received: '),
        onError: (err) => console.error(err),
      });

      console.log('Telegram client connected successfully');
      this.isConnected = true;

      const newSessionString = this.client.session.save();
      if (newSessionString !== this.sessionString) {
        console.log('New session string generated. Please save it to .env file:');
        console.log(`SESSION_STRING=${newSessionString}`);
        
        await this.saveSessionString(newSessionString);
      }

      const me = await this.client.getMe();
      console.log(`Logged in as ${me.firstName} ${me.lastName || ''} (@${me.username || 'no username'})`);
      
      return true;
    } catch (error) {
      console.error('Failed to initialize Telegram client:', error);
      throw error;
    }
  }

  async saveSessionString(sessionString) {
    try {
      const envPath = path.join(process.cwd(), '.env');
      let envContent = await fs.readFile(envPath, 'utf-8').catch(() => '');
      
      if (envContent.includes('SESSION_STRING=')) {
        envContent = envContent.replace(/SESSION_STRING=.*/g, `SESSION_STRING=${sessionString}`);
      } else {
        envContent += `\nSESSION_STRING=${sessionString}`;
      }
      
      await fs.writeFile(envPath, envContent);
    } catch (error) {
      console.error('Could not auto-save session string:', error);
    }
  }

  /**
   * Invite Rosie bot to a group
   * This allows the main Telegram API account to invite Rosie bot
   */
  async inviteRosieBot(groupId) {
    if (!this.isConnected) {
      throw new Error('Telegram client is not connected');
    }

    const rosieBotUsername = process.env.ROSIE_BOT_USERNAME || 'RosieBot';
    
    try {
      console.log(`Inviting Rosie bot (${rosieBotUsername}) to group ${groupId}`);
      
      const botUsernameClean = rosieBotUsername.replace('@', '');
      
      let botEntity;
      try {
        botEntity = await this.client.getEntity(botUsernameClean);
        console.log(`Found Rosie bot: ${rosieBotUsername}`);
      } catch (error) {
        console.error(`Could not find Rosie bot ${botUsernameClean}:`, error);
        throw new Error(`Rosie bot ${rosieBotUsername} not found. Make sure the bot username is correct.`);
      }
      
      const groupEntity = await this.client.getEntity(parseInt(groupId));
      
      await this.client.invoke(
        new Api.channels.InviteToChannel({
          channel: groupEntity,
          users: [botEntity.id]
        })
      );
      
      console.log(`Successfully invited Rosie bot ${rosieBotUsername} to group`);
      
      return {
        success: true,
        message: `Rosie bot ${rosieBotUsername} invited successfully`
      };
    } catch (error) {
      console.error('Error inviting Rosie bot:', error);
      throw error;
    }
  }


  /**
   * Invite a user to the existing manually-created group
   * This is used when users have purchased access and need to be added
   */
  async inviteUserToGroup(groupId, userToInvite) {
    if (!this.isConnected) {
      throw new Error('Telegram client is not connected');
    }

    try {
      console.log(`Inviting user to group ${groupId}: ${userToInvite}`);

      // Clean username
      const userUsernameClean = userToInvite.replace('@', '');
      
      let userEntity;
      
      try {
        userEntity = await this.client.getEntity(userUsernameClean);
        console.log(`Found user: ${userToInvite} with ID: ${userEntity.id}`);
      } catch (error) {
        console.error(`Could not find user ${userUsernameClean}:`, error);
        throw new Error(`User ${userToInvite} not found. Make sure the username is correct.`);
      }

      // Get group entity - KEEP AS STRING, let the API handle it
      let groupEntity;
      try {
        groupEntity = await this.client.getEntity(groupId); // Pass as string
        console.log(`Found group: ${groupId}`);
      } catch (error) {
        console.error(`Could not find group ${groupId}:`, error);
        throw new Error(`Group ${groupId} not found. Make sure the group ID is correct.`);
      }

      // Check if it's a channel/supergroup or basic group
      const isChannel = groupEntity.className === 'Channel' || groupEntity.megagroup;
      
      console.log('Inviting user to group...');
      console.log('Group type:', groupEntity.className, 'Is Channel/Supergroup:', isChannel);
      console.log('Group entity:', {
        id: groupEntity.id,
        className: groupEntity.className,
        megagroup: groupEntity.megagroup
      });
      
      // Just try to invite using the entity we got
      try {
        // Try as channel/supergroup first
        await this.client.invoke(
          new Api.channels.InviteToChannel({
            channel: groupEntity,
            users: [userEntity]
          })
        );
        console.log('Successfully invited using channels.InviteToChannel');
      } catch (error) {
        console.log('channels.InviteToChannel failed:', error.message);
        
        // If it's a basic group, try AddChatUser 
        if (error.message.includes('InputPeerChat')) {
          console.log('Trying messages.AddChatUser for basic group');
          
          // Pass the group entity directly - it's already an InputPeer
          await this.client.invoke(
            new Api.messages.AddChatUser({
              chatId: groupEntity, // Pass the entity itself
              userId: userEntity,
              fwdLimit: 100
            })
          );
          console.log('Successfully invited using messages.AddChatUser');
        } else {
          throw error;
        }
      }
      
      console.log(`Successfully invited ${userToInvite} to group`);

      return {
        success: true,
        groupId: groupId,
        userInvited: userToInvite,
        workflow: 'direct-invitation',
        note: 'User invited to existing group. No invite links generated for security.'
      };

    } catch (error) {
      console.error('Error in group creation workflow:', error);
      throw error;
    }
  }


  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }
  
  /**
   * Create a new Telegram group
   */
  async createGroup(title, about = '') {
    try {
      if (!this.client) {
        throw new Error('Telegram client not initialized');
      }
      
      const result = await this.client.invoke(
        new Api.messages.CreateChat({
          users: [], // Empty initially
          title: title
        })
      );
      
      // Get the created chat ID
      const chatId = result.updates.chats[0].id;
      const groupId = `-${chatId}`; // Basic group format
      
      console.log(`Created group: ${title} with ID: ${groupId}`);
      
      return {
        success: true,
        groupId,
        title
      };
      
    } catch (error) {
      console.error('Error creating group:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Add user as admin to group
   */
  async addGroupAdmin(groupId, username, permissions = {}) {
    try {
      if (!this.client) {
        throw new Error('Telegram client not initialized');
      }
      
      // Get entities
      const groupEntity = await this.getGroupEntity(groupId);
      const userEntity = await this.client.getEntity(username);
      
      // For basic groups, we can't set admin rights
      // We need to migrate to supergroup first
      try {
        // Try to migrate to supergroup
        await this.client.invoke(
          new Api.messages.MigrateChat({
            chatId: groupEntity
          })
        );
      } catch (e) {
        console.log('Group might already be a supergroup or migration not needed');
      }
      
      // Add user to group first
      try {
        await this.client.invoke(
          new Api.messages.AddChatUser({
            chatId: groupEntity,
            userId: userEntity,
            fwdLimit: 0
          })
        );
      } catch (e) {
        console.log('User might already be in group');
      }
      
      // Try to set admin rights (works for supergroups)
      try {
        const adminRights = new Api.ChatAdminRights({
          changeInfo: permissions.canChangeInfo || false,
          deleteMessages: permissions.canDeleteMessages || true,
          banUsers: permissions.canRestrictMembers || true,
          inviteUsers: permissions.canInviteUsers || false,
          pinMessages: permissions.canPinMessages || true,
          addAdmins: permissions.canPromoteMembers || false,
          anonymous: false,
          manageCall: false,
          other: false
        });
        
        await this.client.invoke(
          new Api.channels.EditAdmin({
            channel: groupEntity,
            userId: userEntity,
            adminRights: adminRights,
            rank: 'Admin'
          })
        );
      } catch (e) {
        console.log('Could not set admin rights - group might be basic group');
      }
      
      console.log(`Added ${username} as admin to group ${groupId}`);
      
      return {
        success: true,
        message: 'Admin added successfully'
      };
      
    } catch (error) {
      console.error('Error adding admin:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = TelegramService;