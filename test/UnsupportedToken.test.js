const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployTemplModules } = require('./utils/modules');
const { attachTemplInterface } = require('./utils/templ');

describe('Unsupported access token types', function () {
  const ENTRY_FEE = ethers.parseUnits('100', 18);
  const BURN_BPS = 3000;
  const TREASURY_BPS = 3000;
  const MEMBER_BPS = 3000;
  const PROTOCOL_BPS = 1000;
  const QUORUM_BPS = 3300;

  it('reverts join with fee-on-transfer access token', async function () {
    const [deployer, priest, user, sink] = await ethers.getSigners();

    const { membershipModule, treasuryModule, governanceModule } = await deployTemplModules();

    const FeeToken = await ethers.getContractFactory(
      'contracts/mocks/FeeOnTransferToken.sol:FeeOnTransferToken'
    );
    // 5% fee-on-transfer token
    const feeToken = await FeeToken.deploy('FeeToken', 'FEE', 500, sink.address);
    await feeToken.waitForDeployment();

    const Templ = await ethers.getContractFactory('TEMPL');
    let templ = await Templ.deploy(
      priest.address,
      priest.address,
      await feeToken.getAddress(),
      ENTRY_FEE,
      BURN_BPS,
      TREASURY_BPS,
      MEMBER_BPS,
      PROTOCOL_BPS,
      QUORUM_BPS,
      7 * 24 * 60 * 60,
      '0x000000000000000000000000000000000000dEaD',
      false,
      0,
      'Fee Templ',
      'Testing unsupported token',
      'https://templ.test/logo.png',
      0,
      0,
      membershipModule,
      treasuryModule,
      governanceModule,
      {
        primary: { style: 2, rateBps: 11000, length: 0 },
        additionalSegments: []
      }
    );
    await templ.waitForDeployment();
    templ = await attachTemplInterface(templ);

    await feeToken.mint(user.address, ENTRY_FEE);
    await feeToken.connect(user).approve(await templ.getAddress(), ENTRY_FEE);

    await expect(templ.connect(user).join()).to.be.revertedWithCustomError(templ, 'UnsupportedToken');
  });
});

