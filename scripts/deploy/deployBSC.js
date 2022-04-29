const hre = require("hardhat");

async function main() {
  const CrossChainSwap = await hre.ethers.getContractFactory("RubicRouterV2");
  /*
   * constructor
   *    address _messageBus,
   *    address[] memory _supportedDEXes,
   *    address _nativeWrap
   */

  // BNB Chain 56
  // MessageBus 0x95714818fdd7a5454F73Da9c777B3ee6EbAEEa6B
  // BNB native token address in BSC: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
  // USDC token address in BSC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  const CrossChainSwapDeploy = await CrossChainSwap.deploy(
        '0x95714818fdd7a5454F73Da9c777B3ee6EbAEEa6B',
      ['0x10ed43c718714eb63d5aa57b78b54704e256024e','0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506','0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7','0x1111111254fb6c44bAC0beD2854e76F90643097d'],
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  );

  await CrossChainSwapDeploy.deployed();

  console.log("CrossChainSwapDeploy deployed to:", CrossChainSwapDeploy.address);
  await new Promise(r => setTimeout(r, 10000));

  await hre.run("verify:verify", {
    address: CrossChainSwapDeploy.address,
    constructorArguments: [
      '0x95714818fdd7a5454F73Da9c777B3ee6EbAEEa6B',
      ['0x10ed43c718714eb63d5aa57b78b54704e256024e','0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506','0xcF0feBd3f17CEf5b47b0cD257aCf6025c5BFf3b7','0x1111111254fb6c44bAC0beD2854e76F90643097d'],
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    ],
  });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
