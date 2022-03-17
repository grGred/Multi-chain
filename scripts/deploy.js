const hre = require("hardhat");

async function main() {
  const CrossChainSwap = await hre.ethers.getContractFactory("SwapMain");
  /*
   * constructor
   *     address _messageBus,
   *     address _supportedDex,
   *     address _nativeWrap
   */

  // BNB Chain 56
  // MessageBus 0x223fB0CeB2C6e5310264EFe38151d7D083db91f1
  // BNB native token address in BSC: 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c
  // USDC token address in BSC: 0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  const CrossChainSwapDeploy = await CrossChainSwap.deploy(
      '0x223fB0CeB2C6e5310264EFe38151d7D083db91f1',
      '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
  );

  // MATIC Polygon 137
  // MessageBus 0x265B25e22bcd7f10a5bD6E6410F10537Cc7567e8
  // MATIC native token address in BSC: 0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270
  // USDC token address in BSC: 0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  // MATIC Polygon Testnet 80001
  // MessageBus 0x7d43AABC515C356145049227CeE54B608342c0ad
  // MATIC native token address:
  // USDC token address:
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  // const CrossChainSwapDeploy = await CrossChainSwap.deploy('0x265B25e22bcd7f10a5bD6E6410F10537Cc7567e8', '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270');

  // BNB TEST 97
  // MessageBus 0xAd204986D6cB67A5Bc76a3CB8974823F43Cb9AAA
  // WBNB native token address in BSC: 0x094616F0BdFB0b526bD735Bf66Eca0Ad254ca81F
  // USDC token address in BSC: 0x9744ae566c64B6B6f7F9A4dD50f7496Df6Fef990
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  // const CrossChainSwapDeploy = await CrossChainSwap.deploy('0xAd204986D6cB67A5Bc76a3CB8974823F43Cb9AAA', '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', '0xCe7F7c709E8c74D8ad069Ed28abF25ddC43b32a9');

  // GOERLI TEST 5
  // MessageBus 0x942E8e0e4b021F55b89660c886146e0Ec57F4b5B
  // WETH native token address in BSC: 0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6
  // USDC token address in BSC: 0xCe7F7c709E8c74D8ad069Ed28abF25ddC43b32a9
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  // const CrossChainSwapDeploy = await CrossChainSwap.deploy('0x942E8e0e4b021F55b89660c886146e0Ec57F4b5B', '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6');

  // AVALANCHE 43114
  // MessageBus 0x7d43AABC515C356145049227CeE54B608342c0ad
  // WAVAX native token address in AVALANCHE: 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7
  // USDC token address in AVALANCHE: 0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664
  // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

  // const CrossChainSwapDeploy = await CrossChainSwap.deploy('0x7d43AABC515C356145049227CeE54B608342c0ad', '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506', '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7');


  await CrossChainSwapDeploy.deployed();

  console.log("CrossChainSwapDeploy deployed to:", CrossChainSwapDeploy.address);

  await new Promise(r => setTimeout(r, 10000));

  await hre.run("verify:verify", {
    address: CrossChainSwapDeploy.address,
    constructorArguments: [
      '0x223fB0CeB2C6e5310264EFe38151d7D083db91f1',
      '0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // BSC
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
