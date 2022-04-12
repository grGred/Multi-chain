import { Fixture } from 'ethereum-waffle';
import { ethers, network } from 'hardhat';
import { MAX_RUBIC_SWAP } from './consts';
import { TestERC20 } from '../../typechain-types';
import { SwapMain } from '../../typechain-types';
import { WETH9 } from '../../typechain-types';
import { TestMessages } from '../../typechain-types';
import { MessageBusSender } from '../../typechain-types';
import TokenJSON from '../../artifacts/contracts/test/TestERC20.sol/TestERC20.json';
import WETHJSON from '../../artifacts/contracts/test/WETH9.sol/WETH9.json';
import MessageBusJSON from '../../artifacts/contracts/message/messagebus/MessageBusSender.sol/MessageBusSender.json';
import {expect} from "chai";

const envConfig = require('dotenv').config();
const {
    ROUTERS_BSC_TESTNET: TEST_ROUTERS,
    NATIVE_BSC_TESTNET: TEST_NATIVE,
    BUS_BSC_TESTNET: TEST_BUS,
    TRANSIT_BSC_TESTNET: TEST_TRANSIT,
    SWAP_TOKEN_BSC_TESTNET: TEST_SWAP_TOKEN
} = envConfig.parsed || {};

// async function testTokenFixture(): Promise<{ token: TestERC20 }> {
//     const token = (await (await ethers.getContractFactory('TestERC20')).deploy()) as TestERC20;
//
//     return { token };
// }

interface SwapContractFixture {
    swapMain: SwapMain;
    swapToken: TestERC20;
    token: TestERC20;
    wnative: WETH9;
    router: string;
    testMessagesContract: TestMessages;
    messageBus: MessageBusSender;
}

// interface TestContractsFixture {
//
// }

// export const swapContractFixtureWithLocalToken: Fixture<SwapContractFixture> = async function (
//     wallets
// ): Promise<SwapContractFixture> {
//     const { token } = await testTokenFixture();
//
//     const wnativeFactory = ethers.ContractFactory.fromSolidity(WETHJSON);
//     let wnative = wnativeFactory.attach(TEST_NATIVE) as WETH9;
//     wnative = wnative.connect(wallets[0]);
//
//     const swapMainFactory = await ethers.getContractFactory('SwapMain');
//
//     const supportedDEXes = TEST_ROUTERS.split(',');
//     const router = supportedDEXes[0];
//
//     const swapMain = (await swapMainFactory.deploy(
//         TEST_BUS,
//         supportedDEXes,
//         TEST_NATIVE,
//         token.address
//     )) as SwapMain;
//
//     return { swapMain, token, wnative, router };
// };

// export const testFixture: Fixture<TestContractsFixture> = async function (
//     wallets
// ): Promise<TestContractsFixture> {
//     console.log('qwdawda')
//
//
//     console.log(testMessagesContract.address)
//
//     return { testMessagesContract, messageBus };
// };

export const swapContractFixtureInFork: Fixture<SwapContractFixture> = async function (
    wallets
): Promise<SwapContractFixture> {
    const tokenFactory = ethers.ContractFactory.fromSolidity(TokenJSON);
    let token = tokenFactory.attach(TEST_TRANSIT) as TestERC20;
    token = token.connect(wallets[0]);

    const swapTokenFactory = ethers.ContractFactory.fromSolidity(TokenJSON);
    let swapToken = swapTokenFactory.attach(TEST_SWAP_TOKEN) as TestERC20;
    swapToken = swapToken.connect(wallets[0]);

    const wnativeFactory = ethers.ContractFactory.fromSolidity(WETHJSON);
    let wnative = wnativeFactory.attach(TEST_NATIVE) as WETH9;
    wnative = wnative.connect(wallets[0]);

    const swapMainFactory = await ethers.getContractFactory('SwapMain');

    const supportedDEXes = TEST_ROUTERS.split(',');
    const router = supportedDEXes[0];

    const swapMain = (await swapMainFactory.deploy(
        TEST_BUS,
        supportedDEXes,
        TEST_NATIVE,
        TEST_TRANSIT,
        MAX_RUBIC_SWAP
    )) as SwapMain;

    const testMessagesFactory = await ethers.getContractFactory('TestMessages');
    const testMessagesContract = (await testMessagesFactory.deploy()) as TestMessages;

    const messageBusFactory = ethers.ContractFactory.fromSolidity(MessageBusJSON);
    let messageBus = messageBusFactory.attach(TEST_BUS) as MessageBusSender;
    messageBus = messageBus.connect(wallets[0]);

    const abiCoder = ethers.utils.defaultAbiCoder;

    const storageBalancePositionTransit = ethers.utils.keccak256(
        abiCoder.encode(['address'], [wallets[0].address]) +
            abiCoder.encode(['uint256'], [0]).slice(2, 66)
    );

    const storageBalancePositionSwap = ethers.utils.keccak256(
        abiCoder.encode(['address'], [wallets[0].address]) +
            abiCoder.encode(['uint256'], [0]).slice(2, 66)
    );

    // for (let i = 0; i < 5; i++) {
    //     console.log(i, await ethers.provider.getStorageAt(token.address, i));
    // }

    await network.provider.send('hardhat_setStorageAt', [
        token.address,
        storageBalancePositionTransit,
        abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
    ]);

    await network.provider.send('hardhat_setStorageAt', [
        swapToken.address,
        storageBalancePositionSwap,
        abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
    ]);

    expect(await token.balanceOf(wallets[0].address)).to.eq(ethers.utils.parseEther('100000'));
    expect(await swapToken.balanceOf(wallets[0].address)).to.eq(ethers.utils.parseEther('100000'));

    await network.provider.send('hardhat_setBalance', [
        wallets[0].address,
        '0x152D02C7E14AF6800000' // 100000 eth
    ]);

    return { swapMain, swapToken, token, wnative, router, testMessagesContract, messageBus };
};
