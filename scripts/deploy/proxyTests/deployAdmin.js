const hre = require("hardhat");

async function main() {
  const ProxyAdminFactory = await hre.ethers.getContractFactory("ProxyAdmin");
  /*
   * constructor
   *    address _logic,
   *    address admin_,
   *    bytes memory _data
   */

  const ProxyAdminDeploy = await ProxyAdminFactory.deploy();

  await ProxyAdminDeploy.deployed();

  console.log("ProxyAdminDeploy deployed to:", ProxyAdminDeploy.address);

  // await ProxyAdminDeploy.upgrade()
}

// admin 0x1AFC4048A0D1Ecd794f68F2e6a18a27f6594E7F0

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
