async function main() {
  const Contract = await ethers.getContractFactory("SimpleBatchTransfer");
  const contract = await Contract.deploy(
    "0x942E8e0e4b021F55b89660c886146e0Ec57F4b5B" // goerli MessageBus
    // "0xAd204986D6cB67A5Bc76a3CB8974823F43Cb9AAA" // bsc testnet MessageBus
  ); 
  console.log("contract address:", contract.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });