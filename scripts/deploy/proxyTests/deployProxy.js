const hre = require("hardhat");

async function main() {
  const proxyFactory = await hre.ethers.getContractFactory("TransparentUpgradeableProxyV2");
  /*
   * constructor
   *    address _logic,
   *    address admin_,
   *    bytes memory _data
   */

  const proxyDeploy = await proxyFactory.deploy(
      '0x6Ba34Bd6fd373Ac174B636d43d5A5208901257e0',
      '0x1AFC4048A0D1Ecd794f68F2e6a18a27f6594E7F0',
      '0x'
  );

  await proxyDeploy.deployed();

  console.log("proxyDeploy deployed to:", proxyDeploy.address);

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
