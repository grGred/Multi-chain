const hre = require("hardhat");

async function main() {
  const CrossChainSwap = await hre.ethers.getContractFactory("RubicRouterV2");
  /*
   * constructor
   *    address _messageBus,
   *    address[] memory _supportedDEXes,
   *    address _nativeWrap
   */

  // FTM Fantom 250
  // MessageBus 0xFF4E183a0Ceb4Fa98E63BbF8077B929c8E5A2bA4
  // FTM native token address in BSC: 0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83
  // USDC token address in BSC: 0x04068DA6C83AFCFA0e13ba15A6696662335D5B75
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  const CrossChainSwapDeploy = await hre.upgrades.deployProxy(
      CrossChainSwap,
      ['0xFF4E183a0Ceb4Fa98E63BbF8077B929c8E5A2bA4',
      ['0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'],
      '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83'],
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
