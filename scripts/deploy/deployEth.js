const hre = require("hardhat");

async function main() {
  const CrossChainSwap = await hre.ethers.getContractFactory("RubicRouterV2");
  /*
   * constructor
   *    address _messageBus,
   *    address[] memory _supportedDEXes,
   *    address _nativeWrap
   */

  // ETH 1
  // MessageBus 0x4066D196A423b2b3B8B054f4F40efB47a74E200C
  // WETH native token address in ETHEREUM: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  // USDC token address in AVALANCHE: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
  // SUSHI: 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F

    const CrossChainSwapDeploy = await CrossChainSwap.deploy(
      '0x4066D196A423b2b3B8B054f4F40efB47a74E200C',
      ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D','0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F','0xE592427A0AEce92De3Edee1F18E0157C05861564','0x1111111254fb6c44bAC0beD2854e76F90643097d'],
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  );

  await CrossChainSwapDeploy.deployed();

  console.log("CrossChainSwapDeploy deployed to:", CrossChainSwapDeploy.address);
  await new Promise(r => setTimeout(r, 10000));

  await hre.run("verify:verify", {
    address: CrossChainSwapDeploy.address,
    constructorArguments: [
      '0x4066D196A423b2b3B8B054f4F40efB47a74E200C',
      ['0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D','0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F','0xE592427A0AEce92De3Edee1F18E0157C05861564','0x1111111254fb6c44bAC0beD2854e76F90643097d'],
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
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
