const hre = require("hardhat");

async function main() {
  const CrossChainSwap = await hre.ethers.getContractFactory("RubicRouterV2");
  /*
   * constructor
   *    address _messageBus,
   *    address[] memory _supportedDEXes,
   *    address _nativeWrap
   */

  // BNB TEST 97
  // MessageBus 0xAd204986D6cB67A5Bc76a3CB8974823F43Cb9AAA
  // WBNB native token address in BSC: 0x094616F0BdFB0b526bD735Bf66Eca0Ad254ca81F
  // USDC token address in BSC: 0x9744ae566c64B6B6f7F9A4dD50f7496Df6Fef990
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  const CrossChainSwapDeploy = await hre.upgrades.deployProxy(
      CrossChainSwap,
      ['0xAd204986D6cB67A5Bc76a3CB8974823F43Cb9AAA',
      ['0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'],
      '0x094616F0BdFB0b526bD735Bf66Eca0Ad254ca81F'],
      {
          initializer: 'initialize'
      }
  );

  await CrossChainSwapDeploy.deployed();

  console.log("CrossChainSwapDeploy deployed to:", CrossChainSwapDeploy.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
