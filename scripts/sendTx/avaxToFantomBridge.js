const hre = require("hardhat");

async function main() {
    const CrossChainSwap = await hre.ethers.getContractFactory("SwapMain");
    /*
    * constructor
    *    address _messageBus,
    *    address[] memory _supportedDEXes,
    *    address _nativeWrap
    */

    // AVALANCHE 43114
    // MessageBus 0x5a926eeeAFc4D217ADd17e9641e8cE23Cd01Ad57
    // WAVAX native token address in AVALANCHE: 0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7
    // USDC token address in AVALANCHE: 0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664
    // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

    // FTM Fantom 250
    // MessageBus 0xFF4E183a0Ceb4Fa98E63BbF8077B929c8E5A2bA4
    // FTM native token address in BSC: 0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83
    // USDC token address in BSC: 0x04068DA6C83AFCFA0e13ba15A6696662335D5B75
    // SUSHI: 0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506

    const address = '';

    const crossChainSwap = await CrossChainSwap.attach(address);

    // src bridge --- dst swap
    await crossChainSwap.bridgeWithSwap(
        0x93f56C28b66Fa3EEF980ab11a8a0E9D09c6576f5,
        21000000000000000000,
        43114,
        '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
        ['0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506',
            '0x0000000000000000000000000000000000000000',
            '1',
            ['0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664', '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7'],
            '0x',
            '999999999999999',
            '0'
        ],
        1000000,
        true,
        {value: 21.00001}
    );

    // src bridge --- dst bridge
    await crossChainSwap.bridgeWithSwap(
        0x93f56C28b66Fa3EEF980ab11a8a0E9D09c6576f5,
        21000000000000000000,
        43114,
        '0x04068DA6C83AFCFA0e13ba15A6696662335D5B75',
        ['0x0000000000000000000000000000000000000000', // no need in dex
            '0x0000000000000000000000000000000000000000', // without integrator
            '4', // bridge
            ['0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664'],
            '0x', // no need in bytes data
            '0', // no need in deadline
            '0' // no need in amountOut min
        ],
        1000000,
        true,
        {value: 21.00001}
    );

    await new Promise(r => setTimeout(r, 10000));

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
