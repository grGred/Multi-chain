require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-etherscan");

// Remember to add your RPC provider URL for Goerli and populate the accounts
// arrays with your testing private key.
module.exports = {
  solidity: "0.8.9",
  networks: {
    goerli: {
      url: "<your_goerli_rpc_url>",
      accounts: ["<your_testing_private_key>"],
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545",
      accounts: ["<your_testing_private_key>"],
    },
  },
};
