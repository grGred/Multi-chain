const hre = require("hardhat");

async function main() {
  const implFactory = await hre.ethers.getContractFactory("RubicRouterV2");

  const implDeploy = await implFactory.deploy();

  await implDeploy.deployed();

  console.log("implDeploy deployed to:", implDeploy.address);

  // implDeploy.initialize('0xFF4E183a0Ceb4Fa98E63BbF8077B929c8E5A2bA4',
  //     ['0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'],
  //     '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83');
}

//0x6Ba34Bd6fd373Ac174B636d43d5A5208901257e0  impl

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
