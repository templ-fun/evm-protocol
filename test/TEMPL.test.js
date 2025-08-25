const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TEMPL - 30/30/30/10 Split", function () {
  let contract;
  let token;
  let deployer;
  let priest;
  let user1;
  let user2;
  let user3;
  const ENTRY_FEE = 100; // 100 wei for easy calculations
  
  beforeEach(async function () {
    [deployer, priest, user1, user2, user3] = await ethers.getSigners();
    
    // Deploy mock token
    const MockToken = await ethers.getContractFactory("MockERC20");
    token = await MockToken.deploy("Test Token", "TEST", 18);
    await token.waitForDeployment();
    
    // Mint tokens to test users
    await token.mint(user1.address, ethers.parseEther("1000"));
    await token.mint(user2.address, ethers.parseEther("1000"));
    await token.mint(user3.address, ethers.parseEther("1000"));
    
    // Deploy TEMPL contract
    const TEMPL = await ethers.getContractFactory("TEMPL");
    contract = await TEMPL.deploy(
      priest.address,
      await token.getAddress(),
      ENTRY_FEE
    );
    await contract.waitForDeployment();
    
    // Approve contract to spend tokens
    await token.connect(user1).approve(await contract.getAddress(), ethers.parseEther("1000"));
    await token.connect(user2).approve(await contract.getAddress(), ethers.parseEther("1000"));
    await token.connect(user3).approve(await contract.getAddress(), ethers.parseEther("1000"));
  });
  
  describe("Deployment", function () {
    it("Should set the correct priest address", async function () {
      expect(await contract.priest()).to.equal(priest.address);
    });
    
    it("Should set the correct token and entry fee", async function () {
      const config = await contract.getConfig();
      expect(config[0]).to.equal(await token.getAddress());
      expect(config[1]).to.equal(ENTRY_FEE);
    });
    
    it("Should reject deployment with entry fee less than 10", async function () {
      const TEMPL = await ethers.getContractFactory("TEMPL");
      await expect(
        TEMPL.deploy(priest.address, await token.getAddress(), 9)
      ).to.be.revertedWith("Entry fee too small for distribution");
    });
    
    it("Should have immutable priest address", async function () {
      // No function to change priest address should exist
      expect(contract.setPriest).to.be.undefined;
    });
  });
  
  describe("Purchase Access - 30/30/30/10 Split", function () {
    it("Should split payment correctly: 30% burn, 30% treasury, 30% pool, 10% protocol", async function () {
      const contractAddress = await contract.getAddress();
      const burnAddress = "0x000000000000000000000000000000000000dEaD";
      
      const initialContractBalance = await token.balanceOf(contractAddress);
      const initialBurnBalance = await token.balanceOf(burnAddress);
      const initialPriestBalance = await token.balanceOf(priest.address);
      
      await contract.connect(user1).purchaseAccess();
      
      const expectedTotal = BigInt(ENTRY_FEE);
      const thirtyPercent = (expectedTotal * 30n) / 100n; // 30 wei
      const tenPercent = (expectedTotal * 10n) / 100n;     // 10 wei
      
      // Check burn address received 30%
      expect(await token.balanceOf(burnAddress)).to.equal(initialBurnBalance + thirtyPercent);
      
      // Check contract holds treasury (30%) + member pool (30%)
      expect(await token.balanceOf(contractAddress)).to.equal(initialContractBalance + thirtyPercent * 2n);
      
      // Check priest received 10% protocol fee
      expect(await token.balanceOf(priest.address)).to.equal(initialPriestBalance + tenPercent);
      
      // Verify treasury and pool balances
      const treasuryInfo = await contract.getTreasuryInfo();
      expect(treasuryInfo[0]).to.equal(thirtyPercent); // treasury balance
      expect(treasuryInfo[1]).to.equal(thirtyPercent); // member pool balance
      expect(treasuryInfo[2]).to.equal(thirtyPercent); // total to treasury
      expect(treasuryInfo[3]).to.equal(thirtyPercent); // total burned
      expect(treasuryInfo[4]).to.equal(tenPercent);    // total protocol fees
    });
    
    it("Should prevent double purchase", async function () {
      await contract.connect(user1).purchaseAccess();
      await expect(
        contract.connect(user1).purchaseAccess()
      ).to.be.revertedWith("Already purchased access");
    });
    
    it("Should track purchase details", async function () {
      await contract.connect(user1).purchaseAccess();
      
      const hasAccess = await contract.hasAccess(user1.address);
      expect(hasAccess).to.be.true;
      
      const details = await contract.getPurchaseDetails(user1.address);
      expect(details[0]).to.be.true; // purchased
      expect(details[1]).to.be.gt(0); // timestamp
      expect(details[2]).to.be.gt(0); // block number
    });
    
    it("Should emit AccessPurchased event with correct values", async function () {
      const expectedTotal = BigInt(ENTRY_FEE);
      const thirtyPercent = (expectedTotal * 30n) / 100n;
      const tenPercent = (expectedTotal * 10n) / 100n;
      
      const tx = await contract.connect(user1).purchaseAccess();
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === "AccessPurchased";
        } catch {
          return false;
        }
      });
      
      const parsedEvent = contract.interface.parseLog(event);
      expect(parsedEvent.args[0]).to.equal(user1.address); // purchaser
      expect(parsedEvent.args[1]).to.equal(expectedTotal); // totalAmount
      expect(parsedEvent.args[2]).to.equal(thirtyPercent); // burnedAmount
      expect(parsedEvent.args[3]).to.equal(thirtyPercent); // treasuryAmount
      expect(parsedEvent.args[4]).to.equal(thirtyPercent); // memberPoolAmount
      expect(parsedEvent.args[5]).to.equal(tenPercent);    // protocolAmount
    });
  });
  
  describe("Member Pool Distribution", function () {
    it("First member should not get pool rewards (no existing members)", async function () {
      await contract.connect(user1).purchaseAccess();
      
      const claimable = await contract.getClaimablePoolAmount(user1.address);
      expect(claimable).to.equal(0);
    });
    
    it("Second member's purchase should create rewards for first member", async function () {
      // First purchase - no rewards
      await contract.connect(user1).purchaseAccess();
      expect(await contract.getClaimablePoolAmount(user1.address)).to.equal(0);
      
      // Second purchase - first member gets 30% of entry fee
      await contract.connect(user2).purchaseAccess();
      
      const expectedReward = (BigInt(ENTRY_FEE) * 30n) / 100n; // 30 wei goes to pool
      const claimable = await contract.getClaimablePoolAmount(user1.address);
      expect(claimable).to.equal(expectedReward); // user1 gets all of it (only member)
    });
    
    it("Should distribute pool rewards pro-rata among existing members", async function () {
      // Three members join
      await contract.connect(user1).purchaseAccess();
      await contract.connect(user2).purchaseAccess();
      await contract.connect(user3).purchaseAccess();
      
      // User1 should have rewards from user2 and user3's purchases
      // From user2: 30 wei (alone)
      // From user3: 15 wei (split with user2)
      const user1Claimable = await contract.getClaimablePoolAmount(user1.address);
      expect(user1Claimable).to.equal(45n); // 30 + 15
      
      // User2 should have rewards only from user3's purchase
      // From user3: 15 wei (split with user1)
      const user2Claimable = await contract.getClaimablePoolAmount(user2.address);
      expect(user2Claimable).to.equal(15n);
      
      // User3 should have no rewards (newest member)
      const user3Claimable = await contract.getClaimablePoolAmount(user3.address);
      expect(user3Claimable).to.equal(0n);
    });
    
    it("Should allow members to claim their pool rewards", async function () {
      // Setup: user1 joins, then user2 joins (creating rewards for user1)
      await contract.connect(user1).purchaseAccess();
      await contract.connect(user2).purchaseAccess();
      
      const claimable = await contract.getClaimablePoolAmount(user1.address);
      expect(claimable).to.equal(30n); // 30% of 100 wei
      
      const initialBalance = await token.balanceOf(user1.address);
      
      // Claim rewards
      await contract.connect(user1).claimMemberPool();
      
      // Check token transfer
      expect(await token.balanceOf(user1.address)).to.equal(initialBalance + claimable);
      
      // Check can't claim again
      expect(await contract.getClaimablePoolAmount(user1.address)).to.equal(0);
      await expect(
        contract.connect(user1).claimMemberPool()
      ).to.be.revertedWith("No rewards to claim");
    });
    
    it("Should emit MemberPoolClaimed event", async function () {
      await contract.connect(user1).purchaseAccess();
      await contract.connect(user2).purchaseAccess();
      
      const claimable = await contract.getClaimablePoolAmount(user1.address);
      
      const tx = await contract.connect(user1).claimMemberPool();
      const receipt = await tx.wait();
      const event = receipt.logs.find(log => {
        try {
          return contract.interface.parseLog(log).name === "MemberPoolClaimed";
        } catch {
          return false;
        }
      });
      
      const parsedEvent = contract.interface.parseLog(event);
      expect(parsedEvent.args[0]).to.equal(user1.address);
      expect(parsedEvent.args[1]).to.equal(claimable);
      expect(parsedEvent.args[2]).to.be.gt(0); // Just check timestamp exists
    });
    
    it("Should track claimed amounts correctly", async function () {
      await contract.connect(user1).purchaseAccess();
      await contract.connect(user2).purchaseAccess();
      
      // Claim once
      await contract.connect(user1).claimMemberPool();
      
      // User3 joins, creating more rewards
      await contract.connect(user3).purchaseAccess();
      
      // User1 should have new rewards (15 wei from user3, split with user2)
      const newClaimable = await contract.getClaimablePoolAmount(user1.address);
      expect(newClaimable).to.equal(15n);
      
      // Can claim again
      await contract.connect(user1).claimMemberPool();
      expect(await contract.getClaimablePoolAmount(user1.address)).to.equal(0);
    });
  });
  
  describe("Treasury Management", function () {
    beforeEach(async function () {
      await contract.connect(user1).purchaseAccess();
      await contract.connect(user2).purchaseAccess();
    });
    
    it("Should only allow priest to withdraw treasury", async function () {
      const treasuryInfo = await contract.getTreasuryInfo();
      const balance = treasuryInfo[0]; // treasury balance
      
      await expect(
        contract.connect(user1).withdrawTreasury(user1.address, balance)
      ).to.be.revertedWith("Only priest can call this");
      
      // Priest can withdraw
      await expect(
        contract.connect(priest).withdrawTreasury(priest.address, balance)
      ).to.not.be.reverted;
    });
    
    it("Should not allow withdrawing from member pool via treasury withdrawal", async function () {
      const treasuryInfo = await contract.getTreasuryInfo();
      const treasuryBalance = treasuryInfo[0];
      const poolBalance = treasuryInfo[1];
      
      // Try to withdraw more than treasury (would need to touch pool)
      await expect(
        contract.connect(priest).withdrawTreasury(priest.address, treasuryBalance + 1n)
      ).to.be.revertedWith("Insufficient treasury balance");
      
      // Pool should remain untouched
      const afterInfo = await contract.getTreasuryInfo();
      expect(afterInfo[1]).to.equal(poolBalance);
    });
    
    it("Should correctly withdraw all treasury without affecting pool", async function () {
      const treasuryInfo = await contract.getTreasuryInfo();
      const treasuryBalance = treasuryInfo[0];
      const poolBalance = treasuryInfo[1];
      
      const initialPriestBalance = await token.balanceOf(priest.address);
      
      await contract.connect(priest).withdrawAllTreasury(priest.address);
      
      // Check priest received treasury funds
      expect(await token.balanceOf(priest.address)).to.equal(initialPriestBalance + treasuryBalance);
      
      // Check treasury is empty but pool unchanged
      const newInfo = await contract.getTreasuryInfo();
      expect(newInfo[0]).to.equal(0); // treasury empty
      expect(newInfo[1]).to.equal(poolBalance); // pool unchanged
    });
  });
  
  describe("Security Features", function () {
    it("Should prevent purchases when paused", async function () {
      await contract.connect(priest).setPaused(true);
      
      await expect(
        contract.connect(user1).purchaseAccess()
      ).to.be.revertedWith("Contract is paused");
    });
    
    it("Should only allow priest to pause", async function () {
      await expect(
        contract.connect(user1).setPaused(true)
      ).to.be.revertedWith("Only priest can call this");
    });
    
    it("Should only allow priest to update config", async function () {
      await expect(
        contract.connect(user1).updateConfig(await token.getAddress(), 200)
      ).to.be.revertedWith("Only priest can call this");
    });
    
    it("Should require minimum entry fee in config update", async function () {
      await expect(
        contract.connect(priest).updateConfig(await token.getAddress(), 5)
      ).to.be.revertedWith("Entry fee too small for distribution");
    });
    
    it("Should prevent recovering access token through recoverWrongToken", async function () {
      await expect(
        contract.connect(priest).recoverWrongToken(await token.getAddress(), priest.address)
      ).to.be.revertedWith("Use withdrawTreasury for access tokens");
    });
    
    it("Non-members cannot claim from pool", async function () {
      await contract.connect(user1).purchaseAccess();
      await contract.connect(user2).purchaseAccess();
      
      // User3 hasn't purchased
      await expect(
        contract.connect(user3).claimMemberPool()
      ).to.be.revertedWith("No rewards to claim");
    });
  });
  
  describe("Complex Scenarios", function () {
    it("Should handle many members joining and claiming correctly", async function () {
      // Get initial balances
      const signers = await ethers.getSigners();
      const users = signers.slice(2, 7); // Use 5 test users starting from index 2
      
      // Give them tokens and approve
      for (const user of users) {
        await token.mint(user.address, ethers.parseEther("1000"));
        await token.connect(user).approve(await contract.getAddress(), ethers.parseEther("1000"));
      }
      
      // All users join sequentially
      for (const user of users) {
        await contract.connect(user).purchaseAccess();
      }
      
      // Check claimable amounts
      // User 0: rewards from users 1,2,3,4 = 30 + 15 + 10 + 7.5 = 62.5 (rounding to 62)
      // User 1: rewards from users 2,3,4 = 15 + 10 + 7.5 = 32.5 (rounding to 32)
      // User 2: rewards from users 3,4 = 10 + 7.5 = 17.5 (rounding to 17)
      // User 3: rewards from user 4 = 7.5 (rounding to 7)
      // User 4: no rewards
      
      // Note: Actual values depend on Solidity integer division
      // Check if we have enough users
      const numUsers = Math.min(users.length, 5);
      const claimables = [];
      
      for (let i = 0; i < numUsers; i++) {
        if (users[i]) {
          const claimable = await contract.getClaimablePoolAmount(users[i].address);
          claimables.push(claimable);
        }
      }
      
      // Verify the pattern based on available users
      if (numUsers >= 5) {
        const [claimable0, claimable1, claimable2, claimable3, claimable4] = claimables;
      
        expect(claimable0).to.be.gt(0);
        expect(claimable1).to.be.gt(0);
        expect(claimable2).to.be.gt(0);
        expect(claimable3).to.be.gt(0);
        expect(claimable4).to.equal(0);
        
        // Earlier members get more rewards
        expect(claimable0).to.be.gt(claimable1);
        expect(claimable1).to.be.gt(claimable2);
        expect(claimable2).to.be.gt(claimable3);
      } else {
        // Handle case with fewer users
        for (let i = 0; i < numUsers - 1; i++) {
          expect(claimables[i]).to.be.gt(0);
        }
        if (numUsers > 0) {
          expect(claimables[numUsers - 1]).to.equal(0); // Last user gets no rewards
        }
      }
    });
    
    it("Should maintain correct totals after multiple operations", async function () {
      // Multiple purchases
      await contract.connect(user1).purchaseAccess();
      await contract.connect(user2).purchaseAccess();
      await contract.connect(user3).purchaseAccess();
      
      const config = await contract.getConfig();
      expect(config[3]).to.equal(3); // total purchases
      
      const treasuryInfo = await contract.getTreasuryInfo();
      const expectedPerPurchase = 30n; // 30% of 100 wei
      
      expect(treasuryInfo[2]).to.equal(expectedPerPurchase * 3n); // total to treasury
      expect(treasuryInfo[3]).to.equal(expectedPerPurchase * 3n); // total burned
      expect(treasuryInfo[4]).to.equal(10n * 3n); // total protocol fees (10% each)
      
      // Member claims don't affect totals
      await contract.connect(user1).claimMemberPool();
      const treasuryInfo2 = await contract.getTreasuryInfo();
      expect(treasuryInfo2[2]).to.equal(treasuryInfo[2]); // unchanged
      expect(treasuryInfo2[3]).to.equal(treasuryInfo[3]); // unchanged
    });
  });
});

// Mock ERC20 for testing
const MockERC20 = `
pragma solidity ^0.8.19;

contract MockERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;
    
    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        
        return true;
    }
}
`;