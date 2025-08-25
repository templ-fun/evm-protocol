// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function decimals() external view returns (uint8);
}

/**
 * @title TEMPL - Telegram Entry Management Protocol
 * @dev Splits: 30% burn, 30% treasury, 30% member pool, 10% protocol
 */
contract TEMPL {
    // State variables
    address public immutable priest; // Protocol address for 10% fee
    address public accessToken;
    uint256 public entryFee;
    uint256 public treasuryBalance;
    uint256 public memberPoolBalance;
    bool public paused;
    
    // Track purchases
    mapping(address => bool) public hasPurchased;
    mapping(address => uint256) public purchaseTimestamp;
    mapping(address => uint256) public purchaseBlock;
    
    // Member pool tracking - simplified
    address[] public members; // List of all members in order
    mapping(address => uint256) public memberIndex; // Index in members array
    mapping(address => uint256) public memberPoolClaims; // Track claimed amounts
    uint256[] public poolDeposits; // Pool amount from each purchase
    
    // Totals
    uint256 public totalPurchases;
    uint256 public totalBurned;
    uint256 public totalToTreasury;
    uint256 public totalToMemberPool;
    uint256 public totalToProtocol;
    
    // Events
    event AccessPurchased(
        address indexed purchaser,
        uint256 totalAmount,
        uint256 burnedAmount,
        uint256 treasuryAmount,
        uint256 memberPoolAmount,
        uint256 protocolAmount,
        uint256 timestamp,
        uint256 blockNumber,
        uint256 purchaseId
    );
    
    event MemberPoolClaimed(
        address indexed member,
        uint256 amount,
        uint256 timestamp
    );
    
    event TreasuryWithdrawn(
        address indexed priest,
        address indexed recipient,
        uint256 amount,
        uint256 timestamp
    );
    
    event ConfigUpdated(
        address indexed token,
        uint256 entryFee
    );
    
    event ContractPaused(bool isPaused);
    
    // Modifiers
    modifier onlyPriest() {
        require(msg.sender == priest, "Only priest can call this");
        _;
    }
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    
    /**
     * @dev Constructor
     * @param _priest Address that receives protocol fees and controls admin functions
     * @param _token Address of the ERC20 token
     * @param _entryFee Total entry fee in wei (absolute value)
     */
    constructor(
        address _priest,
        address _token,
        uint256 _entryFee
    ) {
        require(_priest != address(0), "Invalid priest address");
        require(_token != address(0), "Invalid token address");
        require(_entryFee > 0, "Entry fee must be greater than 0");
        require(_entryFee >= 10, "Entry fee too small for distribution");
        
        priest = _priest;
        accessToken = _token;
        entryFee = _entryFee;
        paused = false;
    }
    
    /**
     * @dev Purchase group access
     * Splits: 30% burn, 30% treasury, 30% member pool, 10% protocol
     */
    function purchaseAccess() external whenNotPaused {
        require(!hasPurchased[msg.sender], "Already purchased access");
        
        // Calculate splits (30%, 30%, 30%, 10%)
        uint256 thirtyPercent = (entryFee * 30) / 100;
        uint256 tenPercent = (entryFee * 10) / 100;
        
        // Ensure we have the full amount
        uint256 totalRequired = thirtyPercent * 3 + tenPercent;
        require(totalRequired <= entryFee, "Calculation error");
        
        require(
            IERC20(accessToken).balanceOf(msg.sender) >= entryFee,
            "Insufficient token balance"
        );
        
        // 1. Burn 30%
        bool burnSuccess = IERC20(accessToken).transferFrom(
            msg.sender,
            address(0x000000000000000000000000000000000000dEaD),
            thirtyPercent
        );
        require(burnSuccess, "Burn transfer failed");
        
        // 2. Treasury 30%
        bool treasurySuccess = IERC20(accessToken).transferFrom(
            msg.sender,
            address(this),
            thirtyPercent
        );
        require(treasurySuccess, "Treasury transfer failed");
        
        // 3. Member Pool 30% (stays in contract)
        bool poolSuccess = IERC20(accessToken).transferFrom(
            msg.sender,
            address(this),
            thirtyPercent
        );
        require(poolSuccess, "Pool transfer failed");
        
        // 4. Protocol fee 10% (to priest)
        bool protocolSuccess = IERC20(accessToken).transferFrom(
            msg.sender,
            priest,
            tenPercent
        );
        require(protocolSuccess, "Protocol transfer failed");
        
        // Update balances
        treasuryBalance += thirtyPercent;
        memberPoolBalance += thirtyPercent;
        totalBurned += thirtyPercent;
        totalToTreasury += thirtyPercent;
        totalToMemberPool += thirtyPercent;
        totalToProtocol += tenPercent;
        
        // Record pool deposit for existing members (before adding new member)
        if (members.length > 0) {
            poolDeposits.push(thirtyPercent);
        } else {
            poolDeposits.push(0); // First member doesn't get rewards from their own purchase
        }
        
        // Mark purchase and add to members list
        hasPurchased[msg.sender] = true;
        purchaseTimestamp[msg.sender] = block.timestamp;
        purchaseBlock[msg.sender] = block.number;
        memberIndex[msg.sender] = members.length;
        members.push(msg.sender);
        totalPurchases++;
        
        emit AccessPurchased(
            msg.sender,
            entryFee,
            thirtyPercent,
            thirtyPercent,
            thirtyPercent,
            tenPercent,
            block.timestamp,
            block.number,
            totalPurchases - 1
        );
    }
    
    /**
     * @dev Calculate claimable amount from member pool
     */
    function getClaimablePoolAmount(address member) public view returns (uint256) {
        if (!hasPurchased[member]) {
            return 0;
        }
        
        uint256 memberIdx = memberIndex[member];
        uint256 totalClaimable = 0;
        
        // Calculate share from each deposit after this member joined
        for (uint256 i = memberIdx + 1; i < poolDeposits.length; i++) {
            if (poolDeposits[i] > 0) {
                // Number of members who share this deposit (all who joined before deposit i)
                uint256 eligibleMembers = i; // i members existed when deposit i was made
                if (eligibleMembers > 0) {
                    uint256 sharePerMember = poolDeposits[i] / eligibleMembers;
                    totalClaimable += sharePerMember;
                }
            }
        }
        
        // Subtract already claimed amount
        return totalClaimable > memberPoolClaims[member] ? 
               totalClaimable - memberPoolClaims[member] : 0;
    }
    
    /**
     * @dev Claim member pool rewards
     */
    function claimMemberPool() external {
        uint256 claimable = getClaimablePoolAmount(msg.sender);
        require(claimable > 0, "No rewards to claim");
        require(memberPoolBalance >= claimable, "Insufficient pool balance");
        
        memberPoolClaims[msg.sender] += claimable;
        memberPoolBalance -= claimable;
        
        bool success = IERC20(accessToken).transfer(msg.sender, claimable);
        require(success, "Pool claim transfer failed");
        
        emit MemberPoolClaimed(msg.sender, claimable, block.timestamp);
    }
    
    /**
     * @dev Withdraw treasury funds - ONLY PRIEST CAN CALL
     */
    function withdrawTreasury(address recipient, uint256 amount) external onlyPriest {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be greater than 0");
        require(amount <= treasuryBalance, "Insufficient treasury balance");
        
        treasuryBalance -= amount;
        
        bool success = IERC20(accessToken).transfer(recipient, amount);
        require(success, "Treasury withdrawal failed");
        
        emit TreasuryWithdrawn(
            msg.sender,
            recipient,
            amount,
            block.timestamp
        );
    }
    
    /**
     * @dev Withdraw all treasury funds
     */
    function withdrawAllTreasury(address recipient) external onlyPriest {
        require(recipient != address(0), "Invalid recipient");
        require(treasuryBalance > 0, "No treasury funds");
        
        uint256 amount = treasuryBalance;
        treasuryBalance = 0;
        
        bool success = IERC20(accessToken).transfer(recipient, amount);
        require(success, "Treasury withdrawal failed");
        
        emit TreasuryWithdrawn(
            msg.sender,
            recipient,
            amount,
            block.timestamp
        );
    }
    
    /**
     * @dev Check if an address has purchased access
     */
    function hasAccess(address user) external view returns (bool) {
        return hasPurchased[user];
    }
    
    /**
     * @dev Get purchase details for an address
     */
    function getPurchaseDetails(address user) external view returns (
        bool purchased,
        uint256 timestamp,
        uint256 blockNum
    ) {
        return (
            hasPurchased[user],
            purchaseTimestamp[user],
            purchaseBlock[user]
        );
    }
    
    /**
     * @dev Get treasury and pool information
     */
    function getTreasuryInfo() external view returns (
        uint256 treasury,
        uint256 memberPool,
        uint256 totalReceived,
        uint256 totalBurnedAmount,
        uint256 totalProtocolFees,
        address protocolAddress
    ) {
        return (
            treasuryBalance,
            memberPoolBalance,
            totalToTreasury,
            totalBurned,
            totalToProtocol,
            priest
        );
    }
    
    /**
     * @dev Update contract configuration (priest only)
     */
    function updateConfig(
        address _token,
        uint256 _entryFee
    ) external onlyPriest {
        if (_token != address(0)) {
            accessToken = _token;
        }
        if (_entryFee > 0) {
            require(_entryFee >= 10, "Entry fee too small for distribution");
            entryFee = _entryFee;
        }
        
        emit ConfigUpdated(accessToken, entryFee);
    }
    
    /**
     * @dev Pause or unpause the contract
     */
    function setPaused(bool _paused) external onlyPriest {
        paused = _paused;
        emit ContractPaused(_paused);
    }
    
    /**
     * @dev Get current configuration
     */
    function getConfig() external view returns (
        address token,
        uint256 fee,
        bool isPaused,
        uint256 purchases,
        uint256 treasury,
        uint256 pool
    ) {
        return (accessToken, entryFee, paused, totalPurchases, treasuryBalance, memberPoolBalance);
    }
    
    /**
     * @dev Emergency recovery for wrong tokens sent by mistake
     */
    function recoverWrongToken(address token, address to) external onlyPriest {
        require(token != accessToken, "Use withdrawTreasury for access tokens");
        require(to != address(0), "Invalid recipient");
        
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No tokens to recover");
        
        bool success = IERC20(token).transfer(to, balance);
        require(success, "Token recovery failed");
    }
}