#!/bin/bash

# TEMPL Protocol - New Flow Test Script
# This script helps test the complete temple creation and join flow

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   TEMPL New Flow Test Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if service is running
check_service() {
    if curl -s http://localhost:3002/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Service is running${NC}"
        return 0
    else
        echo -e "${RED}❌ Service is not running${NC}"
        echo -e "${YELLOW}Starting service...${NC}"
        npm start &
        sleep 5
        if curl -s http://localhost:3002/health > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Service started${NC}"
        else
            echo -e "${RED}Failed to start service${NC}"
            exit 1
        fi
    fi
}

# Step 1: Check prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found. Run ./setup.sh first${NC}"
    exit 1
fi

if [ ! -d node_modules ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi

echo -e "${GREEN}✅ Prerequisites checked${NC}"
echo ""

# Step 2: Check if contract exists
echo -e "${YELLOW}Step 2: Checking for deployed contract...${NC}"

source .env
if [ -z "$CONTRACT_ADDRESS" ]; then
    echo -e "${YELLOW}No contract found. Would you like to deploy one now? (y/n)${NC}"
    read -p "> " DEPLOY
    
    if [ "$DEPLOY" = "y" ]; then
        echo -e "${BLUE}Deploying contract...${NC}"
        npm run deploy
        echo -e "${GREEN}✅ Contract deployed${NC}"
        echo -e "${YELLOW}Please update CONTRACT_ADDRESS in .env with the deployed address${NC}"
        echo -e "${YELLOW}Then run this script again${NC}"
        exit 0
    else
        echo -e "${RED}Please deploy a contract first with: npm run deploy${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ Contract found: $CONTRACT_ADDRESS${NC}"
fi
echo ""

# Step 3: Start service if needed
echo -e "${YELLOW}Step 3: Checking service status...${NC}"
check_service
echo ""

# Step 4: Display URLs
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Ready to Test!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${GREEN}URLs for testing:${NC}"
echo ""

echo -e "${YELLOW}1. CREATE TEMPLE (Priest Dashboard):${NC}"
echo -e "   ${BLUE}http://localhost:3002/priest.html${NC}"
echo "   - Connect your priest wallet"
echo "   - Enter contract: $CONTRACT_ADDRESS"
echo "   - Enter group name and your Telegram username"
echo "   - Click 'Create Temple'"
echo "   - Copy the purchase URL you receive"
echo ""

echo -e "${YELLOW}2. TEST PURCHASE (Member Flow):${NC}"
echo -e "   ${BLUE}http://localhost:3002/purchase.html?contract=$CONTRACT_ADDRESS${NC}"
echo "   - Connect any wallet with tokens"
echo "   - Approve and purchase access"
echo "   - Enter Telegram username"
echo "   - Receive group invitation"
echo ""

echo -e "${YELLOW}3. CHECK HEALTH:${NC}"
echo -e "   ${BLUE}http://localhost:3002/health${NC}"
echo ""

echo -e "${YELLOW}4. IN TELEGRAM GROUP:${NC}"
echo "   Type: /contract"
echo "   Bot will show contract info and purchase URL"
echo ""

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Test Checklist:${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "[ ] 1. Open priest.html and create temple"
echo "[ ] 2. Check Telegram - new group created"
echo "[ ] 3. Verify you're admin in the group"
echo "[ ] 4. Test /contract command in group"
echo "[ ] 5. Use purchase URL to buy access"
echo "[ ] 6. Verify 30/30/30/10 split in transaction"
echo "[ ] 7. Enter Telegram username"
echo "[ ] 8. Receive and accept invitation"
echo "[ ] 9. Second member joins to test rewards"
echo "[ ] 10. First member claims pool rewards"
echo ""

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}Database Queries:${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "psql -d telegram_access -c \"SELECT contract_address, telegram_group_id, group_title FROM contracts;\""
echo "psql -d telegram_access -c \"SELECT * FROM purchases ORDER BY created_at DESC LIMIT 5;\""
echo "psql -d telegram_access -c \"SELECT * FROM access_claims WHERE invitation_sent = true;\""
echo ""

echo -e "${YELLOW}Service Logs:${NC}"
echo "Check the terminal where you ran 'npm start' for live logs"
echo ""

echo -e "${GREEN}✨ Happy Testing! ✨${NC}"