const Database = require('../database/db');

/**
 * Simple bot command handler for TEMPL bot
 * Responds to /contract command in groups
 */
class BotCommands {
  constructor() {
    this.db = new Database();
  }

  async initialize() {
    await this.db.initialize();
    console.log('✅ Bot command handler initialized');
  }

  /**
   * Handle /contract command
   * Returns the contract address associated with the group
   */
  async handleContractCommand(groupId) {
    try {
      const query = `
        SELECT 
          contract_address,
          group_title,
          token_address,
          burn_amount
        FROM contracts 
        WHERE telegram_group_id = $1
      `;
      
      const result = await this.db.pool.query(query, [groupId]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'No contract is associated with this group.'
        };
      }
      
      const contract = result.rows[0];
      const purchaseUrl = `${process.env.FRONTEND_URL?.split(',')[0] || 'https://yoursite.com'}/purchase.html?contract=${contract.contract_address}`;
      
      return {
        success: true,
        message: `
⛩️ **TEMPL Contract Info**

📜 **Contract:** \`${contract.contract_address}\`
💰 **Entry Fee:** ${contract.burn_amount} wei
🪙 **Token:** \`${contract.token_address}\`

💎 **Fee Distribution:**
• 30% Burned permanently 🔥
• 30% Treasury (priest-controlled) 🏦
• 30% Member Pool (pro-rata rewards) 🎁
• 10% Protocol fee 💸

🔗 **Purchase Access:** ${purchaseUrl}

Members earn rewards from future purchases!
        `
      };
      
    } catch (error) {
      console.error('Error handling /contract command:', error);
      return {
        success: false,
        message: 'Error retrieving contract information.'
      };
    }
  }

  /**
   * Handle /help command
   */
  async handleHelpCommand() {
    return {
      success: true,
      message: `
⛩️ **TEMPL Bot Commands**

**/contract** - Display this group's contract information
**/help** - Show this help message

**How it works:**
1. Purchase access with tokens
2. Receive group invitation
3. Earn rewards from new members joining

For support, contact the group admin.
      `
    };
  }

  /**
   * Process incoming message for commands
   */
  async processMessage(message, groupId) {
    const text = message.text?.toLowerCase() || '';
    
    if (text === '/contract' || text.startsWith('/contract@')) {
      return await this.handleContractCommand(groupId);
    }
    
    if (text === '/help' || text.startsWith('/help@')) {
      return await this.handleHelpCommand();
    }
    
    return null; // No command found
  }

  async close() {
    await this.db.close();
  }
}

module.exports = BotCommands;